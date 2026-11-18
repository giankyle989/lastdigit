import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { postEntry } from '@/server/ledger'

import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('postEntry', () => {
  beforeEach(resetDb)

  it('credits the balance and records balanceAfter', async () => {
    const u = await makeUser()
    const t = await prisma.$transaction((tx) =>
      postEntry(tx, { account: 'WALLET', userId: u.id, type: 'ADMIN_GRANT', amount: 500, note: 'hi' }),
    )
    expect(t.balanceAfter).toBe(500)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).walletBalance).toBe(500)
    await expectLedgerConsistent()
  })

  it('rejects a debit beyond the balance when requireFunds is set, changing nothing', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) =>
      postEntry(tx, { account: 'WALLET', userId: u.id, type: 'ADMIN_GRANT', amount: 100 }),
    )
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { account: 'WALLET', userId: u.id, type: 'BET', amount: -101 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).walletBalance).toBe(100)
    expect(await prisma.transaction.count()).toBe(1)
  })

  it('keeps the wallet and points apart', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'POINTS', type: 'DAILY_BONUS', amount: 70 }),
    )
    const t = await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'WALLET', type: 'ADMIN_GRANT', amount: 30 }),
    )
    expect(t).toMatchObject({ account: 'WALLET', balanceAfter: 30 })
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect([after.walletBalance, after.pointsBalance]).toEqual([30, 70])
    await expectLedgerConsistent()
  })

  it('names the account that ran short', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'WALLET', type: 'ADMIN_GRANT', amount: 500 }),
    )
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { userId: u.id, account: 'POINTS', type: 'BET', amount: -1 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough points' })
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { userId: u.id, account: 'WALLET', type: 'BET', amount: -501 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet' })
  })

  it('allows a debit to go negative without requireFunds', async () => {
    const u = await makeUser()
    const t = await prisma.$transaction((tx) =>
      postEntry(tx, { account: 'WALLET', userId: u.id, type: 'REFUND', amount: -40 }),
    )
    expect(t.balanceAfter).toBe(-40)
    await expectLedgerConsistent()
  })

  it('rejects zero and non-integer amounts', async () => {
    const u = await makeUser()
    for (const amount of [0, 1.5]) {
      await expect(
        prisma.$transaction((tx) =>
          postEntry(tx, { account: 'WALLET', userId: u.id, type: 'ADMIN_GRANT', amount }),
        ),
      ).rejects.toBeInstanceOf(DomainError)
    }
  })
})
