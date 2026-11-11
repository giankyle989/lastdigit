import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AUTH_ACTION_ALLOWLIST,
  findBalanceWrites,
  hasGuardCall,
  importsDb,
  listFiles,
  serverActionsMissingGuard,
} from './architecture/rules'

const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('rule helpers (fixtures)', () => {
  it('detects balance writes', () => {
    expect(findBalanceWrites('a\ndata: { balance: { increment: 5 } }')).toEqual([2])
    expect(findBalanceWrites('data: { balance: { decrement: amount } }')).toEqual([1])
    expect(findBalanceWrites('data: { balance: 0 }')).toEqual([1])
    expect(findBalanceWrites('UPDATE "User" SET "balance" = 1')).toEqual([1])
    expect(findBalanceWrites('UPDATE "User" SET balance = balance + ${x}')).toEqual([1])
  })

  // Review Focus #5
  it('ignores balance reads and filters', () => {
    expect(findBalanceWrites('select: { balance: true }')).toEqual([])
    expect(findBalanceWrites('where: { balance: { lt: 0 } }')).toEqual([])
    expect(findBalanceWrites('orderBy: { balance: "asc" }')).toEqual([])
    expect(findBalanceWrites('const x = user.balance - 1')).toEqual([])
  })

  it('detects guard calls in pages', () => {
    expect(hasGuardCall('const admin = await requireAdmin()', 'requireAdmin')).toBe(true)
    expect(hasGuardCall('await requireAdmin()', 'requireAdmin')).toBe(true)
    expect(hasGuardCall('import { requireAdmin } from "x"', 'requireAdmin')).toBe(false)
    expect(hasGuardCall('await requireUser()', 'requireAdmin')).toBe(false)
  })

  it('finds server actions without a guard', () => {
    const src = [
      "'use server'",
      'export async function okAction(id: string) {',
      '  const u = await requireUser()',
      '  return u.id + id',
      '}',
      'export async function badAction() {',
      '  return 1',
      '}',
      'export async function loginAction() {',
      '  return 2',
      '}',
    ].join('\n')
    expect(serverActionsMissingGuard(src, AUTH_ACTION_ALLOWLIST)).toEqual(['badAction'])
    expect(serverActionsMissingGuard('export const x = 1\n', [])).toEqual([])
  })

  it('detects db imports', () => {
    expect(importsDb("import { prisma } from '@/lib/db'")).toBe(true)
    expect(importsDb('import type { Tx } from "@/lib/db"')).toBe(true)
    expect(importsDb("import { x } from '@/lib/dbx'")).toBe(false)
    expect(importsDb("import { prisma } from '../../lib/db'")).toBe(true)
    expect(importsDb("import { x } from './lib/dbx'")).toBe(false)
  })
})

describe('repository invariants', () => {
  it('only the ledger writes User.balance', () => {
    const offenders = listFiles('src', /\.(ts|tsx)$/)
      .filter((f) => f !== 'src/server/ledger.ts')
      .flatMap((f) => findBalanceWrites(read(f)).map((line) => `${f}:${line}`))
    expect(offenders, 'balance must only change via postEntry() in src/server/ledger.ts').toEqual([])
  })

  it('every admin page calls requireAdmin()', () => {
    const missing = listFiles('src/app/admin', /page\.tsx$/).filter(
      (f) => !hasGuardCall(read(f), 'requireAdmin'),
    )
    expect(missing, 'admin pages must call await requireAdmin() themselves').toEqual([])
  })

  it('every player page calls requireUser()', () => {
    const missing = listFiles('src/app/(player)', /page\.tsx$/).filter(
      (f) => !hasGuardCall(read(f), 'requireUser'),
    )
    expect(missing, 'player pages must call await requireUser() themselves').toEqual([])
  })

  it('every server action calls a guard', () => {
    const missing = listFiles('src', /\.(ts|tsx)$/)
      .filter((f) => /^\s*['"]use server['"]/.test(read(f)))
      .flatMap((f) => serverActionsMissingGuard(read(f), AUTH_ACTION_ALLOWLIST).map((name) => `${f}#${name}`))
    expect(missing, 'server actions must call requireUser()/requireAdmin()').toEqual([])
  })

  it('app and components never import the database', () => {
    const offenders = [
      ...listFiles('src/app', /\.(ts|tsx)$/),
      ...listFiles('src/components', /\.(ts|tsx)$/),
    ].filter((f) => importsDb(read(f)))
    expect(offenders, 'use a src/server function instead of @/lib/db').toEqual([])
  })
})
