#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): format the edited file and feed remaining lint errors back (exit 2).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const FORMAT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.yml', '.yaml'])
const LINT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs'])
const bin = (name) => path.join(ROOT, 'node_modules', '.bin', name)

let input = null
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}

const file = input?.tool_input?.file_path
if (typeof file !== 'string' || !existsSync(file)) process.exit(0)
const abs = path.resolve(file)
const rel = path.relative(ROOT, abs)
if (rel.startsWith('..') || path.isAbsolute(rel)) process.exit(0)
const ext = path.extname(abs)
if (!FORMAT_EXT.has(ext)) process.exit(0)

spawnSync(
  bin('prettier'),
  ['--write', '--ignore-unknown', '--ignore-path', path.join(ROOT, '.prettierignore'), abs],
  { cwd: ROOT, encoding: 'utf8' },
)

if (LINT_EXT.has(ext)) {
  const r = spawnSync(bin('eslint'), ['--fix', '--max-warnings=0', '--no-warn-ignored', abs], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (r.error || r.status === null) {
    process.stderr.write(`Could not run ESLint: ${r.error?.message ?? 'terminated by signal'}\n`)
    process.exit(2)
  }
  if (r.status !== 0) {
    process.stderr.write(`ESLint found problems in ${rel} (fix them now):\n${r.stdout}${r.stderr}`)
    process.exit(2)
  }
}
process.exit(0)
