import type { Prisma } from '@prisma/client'
import { expect } from 'vitest'
import { prisma } from '@/lib/db'
import { postEntry } from '@/server/ledger'

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "InquiryMessage", "Inquiry", "AdminAction", "Transaction", "Bet", "Game", "Setting", "User" RESTART IDENTITY CASCADE',
  )
}

let seq = 0

export async function makeUser(over: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  seq++
  const username = over.username ?? `user${seq}`
  return prisma.user.create({
    data: {
      passwordHash: 'not-a-real-hash',
      referralCode: `CODE${String(seq).padStart(4, '0')}`,
      ...over,
      username,
      usernameKey: username.toLowerCase(),
      balance: 0, // balances are only changed via the ledger (see fundUser in Task 4)
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

export async function fundUser(userId: string, amount: number) {
  await prisma.$transaction((tx) =>
    postEntry(tx, { userId, type: 'ADMIN_GRANT', amount, note: 'test funding' }),
  )
}

export async function expectLedgerConsistent() {
  const rows = await prisma.$queryRaw<{ id: string; balance: number; total: number }[]>`
    SELECT u.id, u.balance, COALESCE(SUM(t.amount), 0)::int AS total
    FROM "User" u LEFT JOIN "Transaction" t ON t."userId" = u.id
    GROUP BY u.id`
  for (const r of rows) expect(r.balance, `user ${r.id}`).toBe(r.total)
}
