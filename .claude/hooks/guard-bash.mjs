#!/usr/bin/env node
// PreToolUse(Bash) guard for the LastDigit harness. Exit 2 blocks the command; stderr explains why.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const AI_ATTRIBUTION = [
  /co-authored-by:[^\n]*(claude|anthropic)/i,
  /generated (with|by)\s+\[?claude/i,
  /noreply@anthropic\.com/i,
]

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return null
  }
}

const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

/** Split a command into segments at unquoted &&, ||, ;, | and newlines; heredoc bodies stay with their segment. */
function splitSegments(command) {
  const segments = []
  let text = ''
  let head = null
  let quote = ''
  const push = () => {
    if (text.trim()) segments.push({ text, head: head ?? text })
    text = ''
    head = null
  }
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i)
    if (quote) {
      if (c === quote) quote = ''
      text += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      text += c
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      push()
      i++
      continue
    }
    if (c === ';' || c === '|') {
      push()
      continue
    }
    if (c === '\n') {
      const m = HEREDOC.exec(text)
      if (m) {
        head = text
        const lines = command.slice(i + 1).split('\n')
        let consumed = 0
        for (const line of lines) {
          consumed += line.length + 1
          if (line.trim() === m[2]) break
        }
        text += command.slice(i, i + 1 + consumed)
        i += consumed
        continue
      }
      push()
      continue
    }
    text += c
  }
  push()
  return segments
}

function tokenize(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((raw) => {
    const q = raw.startsWith('"') || raw.startsWith("'")
    return { v: q ? raw.slice(1, -1) : raw, q }
  })
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function pushTargetsMaster(args, cwd) {
  const refs = args.filter((a) => !a.startsWith('-'))
  const refspecs = refs.slice(1)
  const force =
    args.some(
      (a) =>
        a === '--force' ||
        a.startsWith('--force-with-lease') ||
        a === '--force-if-includes' ||
        /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a),
    ) || refspecs.some((r) => r.startsWith('+'))
  if (!force) return false
  if (refspecs.length === 0) return currentBranch(cwd) === 'master'
  return refspecs.some((r) => {
    const spec = r.replace(/^\+/, '')
    const dest = (spec.includes(':') ? spec.slice(spec.lastIndexOf(':') + 1) : spec).replace(
      /^refs\/heads\//,
      '',
    )
    return (dest === 'HEAD' ? currentBranch(cwd) : dest) === 'master'
  })
}

function checkSegment({ text, head }, cwd) {
  const all = tokenize(head)
  const gh = all.findIndex((t) => !t.q && t.v === 'gh')
  if (gh !== -1 && all[gh + 1]?.v === 'pr' && ['create', 'edit'].includes(all[gh + 2]?.v ?? '')) {
    if (AI_ATTRIBUTION.some((re) => re.test(text))) return 'PR descriptions must not contain AI attribution'
  }
  const g = all.findIndex((t) => !t.q && t.v === 'git')
  if (g === -1) {
    const p = all.findIndex((t) => !t.q && t.v === 'prisma')
    const [a, b] = [all[p + 1], all[p + 2]]
    if (p !== -1 && a?.v === 'migrate' && b?.v === 'reset') {
      return 'prisma migrate reset is forbidden (destroys data); create a migration with prisma migrate dev --name <name>'
    }
    return null
  }
  let i = g + 1
  let gitCwd = cwd
  while (all[i] && !all[i].q && all[i].v.startsWith('-')) {
    const opt = all[i].v
    if (GIT_OPTS_WITH_VALUE.has(opt)) {
      if (opt === '-C' && all[i + 1]) gitCwd = path.resolve(gitCwd, all[i + 1].v)
      i++
    }
    i++
  }
  const sub = all[i]?.v
  const args = all
    .slice(i + 1)
    .filter((t) => !t.q)
    .map((t) => t.v)

  if (/core\.hooksPath/i.test(head) && !args.includes('--get')) return 'bypasses git hooks (core.hooksPath)'
  if (sub === 'commit' && AI_ATTRIBUTION.some((re) => re.test(text))) {
    return 'commit messages must not contain AI attribution (Co-Authored-By Claude / Generated with Claude Code)'
  }
  if ((sub === 'commit' || sub === 'push') && args.includes('--no-verify')) {
    return '--no-verify skips the git hooks; fix the reported problem instead'
  }
  if (sub === 'commit' && args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) {
    return 'git commit -n skips the git hooks; fix the reported problem instead'
  }
  if (sub === 'push' && pushTargetsMaster(args, gitCwd)) return 'force-pushing to master is forbidden'
  return null
}

function check(command, cwd) {
  const segments = splitSegments(command)
  const husky = segments.some((s) => tokenize(s.head).some((t) => !t.q && t.v === 'HUSKY=0'))
  if (husky && /\bgit\b[^\n]*\b(commit|push)\b/.test(command)) return 'bypasses git hooks (HUSKY=0)'
  for (const segment of segments) {
    const reason = checkSegment(segment, cwd)
    if (reason) return reason
  }
  return null
}

const input = readStdin()
if (!input || input.tool_name !== 'Bash') process.exit(0)
const reason = check(String(input.tool_input?.command ?? ''), input.cwd || process.cwd())
if (reason) {
  process.stderr.write(`Blocked by LastDigit harness: ${reason}\n`)
  process.exit(2)
}
process.exit(0)
