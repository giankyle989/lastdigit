import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

export const AUTH_ACTION_ALLOWLIST = ['loginAction', 'signupAction', 'logoutAction'] as const

const WRITE_CALL = /\.(update|updateMany|upsert|create|createMany)\s*\(/g
const RAW_SQL_BALANCE_WRITES = [/"balance"\s*=/, /\bSET\s+balance\s*=/i]
const USE_SERVER_DIRECTIVE = /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*['"]use server['"]/
const SERVER_ACTION =
  /export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([\s\S]*?)\)\s*(?::[^{]*)?\{([\s\S]*?)\n\}/g

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

/** Index of the string's closing quote (escape-aware). Template `${}` nesting is not tracked. */
function skipString(source: string, start: number): number {
  const quote = source[start]
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++
    else if (source[i] === quote) return i
  }
  return source.length
}

/** Index of the `)` matching the `(` at `open`, or -1. Skips string literals and comments. */
function closingParen(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      if (end === -1) return -1
      i = end
    } else if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) return -1
      i = end + 1
    } else if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(source, i)
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 1-based line numbers of balance writes: a `balance:` key inside the arguments of a
 * write call (update/updateMany/upsert/create/createMany), or a raw-SQL balance assignment.
 * Reads (select, where, orderBy, findMany, ...) and type annotations are not write calls.
 * Known limit: a `balance:` filter inside a write call's `where` is also reported.
 */
export function findBalanceWrites(source: string): number[] {
  const lines = new Set<number>()
  for (const call of source.matchAll(WRITE_CALL)) {
    const index = call.index ?? 0
    const open = index + call[0].length - 1
    const close = closingParen(source, open)
    const args = source.slice(open, close === -1 ? source.length : close + 1)
    if (/\bbalance\s*:/.test(args)) lines.add(lineOf(source, index))
  }
  source.split('\n').forEach((line, i) => {
    if (RAW_SQL_BALANCE_WRITES.some((re) => re.test(line))) lines.add(i + 1)
  })
  return [...lines].sort((a, b) => a - b)
}

export function hasGuardCall(source: string, guard: 'requireUser' | 'requireAdmin'): boolean {
  return new RegExp(`\\bawait\\s+${guard}\\s*\\(`).test(source)
}

/** True when the file's first statement is a `'use server'` directive (leading comments allowed). */
export function isServerActionFile(source: string): boolean {
  return USE_SERVER_DIRECTIVE.test(source)
}

/** Exported async functions parsed from a server-action file, with their bodies. */
export function parseServerActions(source: string): { name: string; body: string }[] {
  return [...source.matchAll(SERVER_ACTION)].map((match) => ({ name: match[1] ?? '', body: match[3] ?? '' }))
}

/** Number of top-level `export` statements (type and interface exports are erased, so not counted). */
export function exportCount(source: string): number {
  return [...source.matchAll(/^export\s+(?!type\s|interface\s)/gm)].length
}

export function serverActionsMissingGuard(source: string, allow: readonly string[]): string[] {
  return parseServerActions(source)
    .filter(({ name, body }) => {
      if (allow.includes(name)) return false
      return !hasGuardCall(body, 'requireUser') && !hasGuardCall(body, 'requireAdmin')
    })
    .map(({ name }) => name)
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
