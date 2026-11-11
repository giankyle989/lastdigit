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
      postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount: 500, note: 'hi' }),
    )
    expect(t.balanceAfter).toBe(500)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(500)
    await expectLedgerConsistent()
  })

  it('rejects a debit beyond the balance when requireFunds is set, changing nothing', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount: 100 }))
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { userId: u.id, type: 'BET', amount: -101 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(100)
    expect(await prisma.transaction.count()).toBe(1)
  })

  it('allows a debit to go negative without requireFunds', async () => {
    const u = await makeUser()
    const t = await prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'REFUND', amount: -40 }))
    expect(t.balanceAfter).toBe(-40)
    await expectLedgerConsistent()
  })

  it('rejects zero and non-integer amounts', async () => {
    const u = await makeUser()
    for (const amount of [0, 1.5]) {
      await expect(
        prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount })),
      ).rejects.toBeInstanceOf(DomainError)
    }
  })
})
