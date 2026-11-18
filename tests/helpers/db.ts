import type { Account, Prisma } from '@prisma/client'
import { expect } from 'vitest'

import { prisma } from '@/lib/db'
import { postEntry } from '@/server/ledger'

import { TRUNCATE_ALL_SQL } from './truncate'

export async function resetDb() {
  await prisma.$executeRawUnsafe(TRUNCATE_ALL_SQL)
}

let seq = 0
let phoneSeq = 0

/** A fresh, valid PH mobile number in E.164 for each call. */
export function nextPhone(): string {
  phoneSeq++
  return `+63917${String(phoneSeq).padStart(7, '0')}`
}

export async function makeUser(over: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  seq++
  const username = over.username ?? `user${seq}`
  return prisma.user.create({
    data: {
      passwordHash: 'not-a-real-hash',
      referralCode: `CODE${String(seq).padStart(4, '0')}`,
      phone: nextPhone(),
      phoneConfirmedAt: new Date(),
      ...over,
      username,
      usernameKey: username.toLowerCase(),
      walletBalance: 0, // balances are only changed via the ledger
    },
  })
}

export async function makeGame(over: Partial<Prisma.GameUncheckedCreateInput> = {}) {
  seq++
  return prisma.game.create({
    data: {
      externalId: 100_000 + seq,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
      ...over,
    },
  })
}

export async function fundUser(userId: string, amount: number, account: Account = 'WALLET') {
  await prisma.$transaction((tx) =>
    postEntry(tx, { userId, account, type: 'ADMIN_GRANT', amount, note: 'test funding' }),
  )
}

/** Each balance equals the sum of its own ledger rows. */
export async function expectLedgerConsistent() {
  const rows = await prisma.$queryRaw<
    { id: string; wallet: number; points: number; walletTotal: number; pointsTotal: number }[]
  >`
    SELECT u.id, u."walletBalance" AS wallet, u."pointsBalance" AS points,
           COALESCE(SUM(t.amount) FILTER (WHERE t.account = 'WALLET'), 0)::int AS "walletTotal",
           COALESCE(SUM(t.amount) FILTER (WHERE t.account = 'POINTS'), 0)::int AS "pointsTotal"
    FROM "User" u LEFT JOIN "Transaction" t ON t."userId" = u.id
    GROUP BY u.id`
  for (const r of rows) {
    expect(r.wallet, `user ${r.id} wallet`).toBe(r.walletTotal)
    expect(r.points, `user ${r.id} points`).toBe(r.pointsTotal)
  }
}
