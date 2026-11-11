import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AUTH_ACTION_ALLOWLIST,
  exportCount,
  findBalanceWrites,
  hasGuardCall,
  importsDb,
  isServerActionFile,
  listFiles,
  parseServerActions,
  serverActionsMissingGuard,
} from './architecture/rules'

const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const allowFor = (file: string): readonly string[] =>
  file === 'src/app/(auth)/actions.ts' ? AUTH_ACTION_ALLOWLIST : []
const serverActionFiles = () => listFiles('src', /\.(ts|tsx)$/).filter((f) => isServerActionFile(read(f)))

describe('rule helpers (fixtures)', () => {
  it('detects balance writes inside write calls', () => {
    expect(findBalanceWrites('tx.user.update({ where: { id }, data: { balance: next } })')).toEqual([1])
    expect(
      findBalanceWrites(
        'prisma.user.update({\n  where: { id },\n  data: {\n    balance: {\n      increment: 5,\n    },\n  },\n})',
      ),
    ).toEqual([1])
    expect(findBalanceWrites('db.user.updateMany({ data: { balance: user.balance + 5 } })')).toEqual([1])
    expect(findBalanceWrites('prisma.user.create({ data: { username, balance: 100 } })')).toEqual([1])
    expect(
      findBalanceWrites('const x = 1\nprisma.user.update({ data: { balance: { decrement: a } } })'),
    ).toEqual([2])
  })

  it('detects raw SQL balance writes', () => {
    expect(findBalanceWrites('UPDATE "User" SET "balance" = 1')).toEqual([1])
    expect(findBalanceWrites('UPDATE "User" SET balance = balance + ${x}')).toEqual([1])
  })

  // Review Focus #5
  it('ignores balance reads, filters and types', () => {
    expect(findBalanceWrites('prisma.user.findMany({ select: { balance: true } })')).toEqual([])
    expect(findBalanceWrites('prisma.user.findMany({ where: { balance: { lt: 0 } } })')).toEqual([])
    expect(findBalanceWrites('orderBy: { balance: "asc" }')).toEqual([])
    expect(findBalanceWrites('const x = user.balance - 1')).toEqual([])
    expect(findBalanceWrites('type P = { username: string; balance: number }')).toEqual([])
    expect(findBalanceWrites('prisma.game.update({ data: { pool: { increment: stake } } })')).toEqual([])
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

  it('parses generics and nested param parens, and requires an awaited guard', () => {
    const generic = 'export async function g<T>(a: T, cb: (x: T) => void) {\n  await requireUser()\n}'
    expect(parseServerActions(generic).map((a) => a.name)).toEqual(['g'])
    expect(serverActionsMissingGuard(generic, [])).toEqual([])
    expect(serverActionsMissingGuard('export async function h() {\n  requireUser()\n}', [])).toEqual(['h'])
  })

  it('counts exports the parser cannot see (fail-loud shape check)', () => {
    const arrow = 'export const x = async () => {\n  return 1\n}'
    expect(exportCount(arrow)).toBe(1)
    expect(parseServerActions(arrow)).toEqual([])
  })

  it('detects the use server directive after leading comments', () => {
    expect(isServerActionFile("// header\n/* note */\n'use server'\nexport {}\n")).toBe(true)
    expect(isServerActionFile("'use server'\n")).toBe(true)
    expect(isServerActionFile('export const a = 1\n')).toBe(false)
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
    const pages = listFiles('src/app/admin', /page\.tsx$/)
    expect(pages.length, 'no admin pages found').toBeGreaterThan(0)
    const missing = pages.filter((f) => !hasGuardCall(read(f), 'requireAdmin'))
    expect(missing, 'admin pages must call await requireAdmin() themselves').toEqual([])
  })

  it('every player page calls requireUser()', () => {
    const pages = listFiles('src/app/(player)', /page\.tsx$/)
    expect(pages.length, 'no player pages found').toBeGreaterThan(0)
    const missing = pages.filter((f) => !hasGuardCall(read(f), 'requireUser'))
    expect(missing, 'player pages must call await requireUser() themselves').toEqual([])
  })

  it('every server action calls a guard', () => {
    const files = serverActionFiles()
    expect(files.length, 'no server action files found').toBeGreaterThan(0)
    const missing = files.flatMap((f) =>
      serverActionsMissingGuard(read(f), allowFor(f)).map((name) => `${f}#${name}`),
    )
    expect(missing, 'server actions must await requireUser()/requireAdmin()').toEqual([])
  })

  it('server action files use a parseable export shape', () => {
    for (const f of serverActionFiles()) {
      expect(
        parseServerActions(read(f)).length,
        `unsupported export shape in ${f} (use \`export async function\`)`,
      ).toBe(exportCount(read(f)))
    }
  })

  it('app and components never import the database', () => {
    const offenders = [
      ...listFiles('src/app', /\.(ts|tsx)$/),
      ...listFiles('src/components', /\.(ts|tsx)$/),
    ].filter((f) => importsDb(read(f)))
    expect(offenders, 'use a src/server function instead of @/lib/db').toEqual([])
  })
})
