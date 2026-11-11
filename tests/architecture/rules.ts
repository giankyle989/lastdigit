import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

export const AUTH_ACTION_ALLOWLIST = ['loginAction', 'signupAction', 'logoutAction'] as const

const BALANCE_WRITE_PATTERNS = [
  /\bbalance\s*:\s*\{\s*(increment|decrement|set|multiply|divide)\b/,
  /\bbalance\s*:\s*-?\d/,
  /"balance"\s*=/,
  /\bSET\s+balance\s*=/i,
]

export function findBalanceWrites(source: string): number[] {
  return source
    .split('\n')
    .flatMap((line, i) => (BALANCE_WRITE_PATTERNS.some((re) => re.test(line)) ? [i + 1] : []))
}

export function hasGuardCall(source: string, guard: 'requireUser' | 'requireAdmin'): boolean {
  return new RegExp(`\\bawait\\s+${guard}\\s*\\(`).test(source)
}

export function serverActionsMissingGuard(source: string, allow: readonly string[]): string[] {
  const missing: string[] = []
  const re = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g
  for (const match of source.matchAll(re)) {
    const name = match[1] ?? ''
    const body = match[2] ?? ''
    if (allow.includes(name)) continue
    if (!/\b(requireUser|requireAdmin)\s*\(/.test(body)) missing.push(name)
  }
  return missing
}

export function importsDb(source: string): boolean {
  return /from\s+['"](@\/lib\/db|(?:\.{1,2}\/)+(?:[\w-]+\/)*lib\/db)['"]/.test(source)
}

export function listFiles(dir: string, match: RegExp): string[] {
  const abs = path.join(ROOT, dir)
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (match.test(entry)) out.push(path.relative(ROOT, full).split(path.sep).join('/'))
    }
  }
  walk(abs)
  return out.sort()
}
