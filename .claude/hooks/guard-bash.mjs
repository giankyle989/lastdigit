#!/usr/bin/env node
// PreToolUse(Bash) guard for the LastDigit harness. Exit 2 blocks the command; stderr explains why.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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

function tokenize(segment) {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
}

const isQuoted = (t) => t.startsWith('"') || t.startsWith("'")

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function check(command, cwd) {
  if (/\bgit\s+commit\b/.test(command) && AI_ATTRIBUTION.some((re) => re.test(command))) {
    return 'commit messages must not contain AI attribution (Co-Authored-By Claude / Generated with Claude Code)'
  }
  const segments = command.split(/&&|\|\||;|\|/)
  for (const segment of segments) {
    const tokens = tokenize(segment.trim()).filter((t) => !isQuoted(t))
    const at = (word) => tokens.indexOf(word)

    const p = at('prisma')
    if (p !== -1 && tokens[p + 1] === 'migrate' && tokens[p + 2] === 'reset') {
      return 'prisma migrate reset is forbidden (destroys data); create a migration with prisma migrate dev --name <name>'
    }

    const g = at('git')
    if (g === -1) continue
    const sub = tokens[g + 1]
    const args = tokens.slice(g + 2)

    if ((sub === 'commit' || sub === 'push') && args.includes('--no-verify')) {
      return '--no-verify skips the git hooks; fix the reported problem instead'
    }
    if (sub === 'commit' && args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) {
      return 'git commit -n skips the git hooks; fix the reported problem instead'
    }
    if (sub === 'push') {
      const force = args.some((a) => a === '--force' || a === '-f' || a.startsWith('--force-with-lease'))
      if (!force) continue
      const refs = args.filter((a) => !a.startsWith('-'))
      const targetsMaster = refs.slice(1).some((r) => r === 'master' || r.endsWith(':master'))
      const bare = refs.length <= 1
      if (targetsMaster || (bare && currentBranch(cwd) === 'master')) {
        return 'force-pushing to master is forbidden'
      }
    }
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
