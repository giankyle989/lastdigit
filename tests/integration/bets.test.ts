import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).balance
}

describe('placeBet', () => {
  beforeEach(resetDb)

  it('deducts the stake, records a BET transaction and grows the pool', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    const bet = await placeBet(u.id, { gameId: g.id, awayDigit: '9', homeDigit: '6', stake: '100' })
    expect(bet).toMatchObject({ awayDigit: 9, homeDigit: 6, stake: 100, result: 'PENDING' })
    expect(await balanceOf(u.id)).toBe(900)
    const t = await prisma.transaction.findFirstOrThrow({ where: { type: 'BET' } })
    expect(t).toMatchObject({ amount: -100, gameId: g.id, betId: bet.id, balanceAfter: 900 })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).pool).toBe(100)
    await expectLedgerConsistent()
  })

  it('merges a second stake on the same ending into one bet', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    const merged = await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 50 })
    expect(merged.stake).toBe(150)
    expect(await prisma.bet.count()).toBe(1)
    expect(await prisma.transaction.count({ where: { type: 'BET' } })).toBe(2)
  })

  it('allows multiple endings on one game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await placeBet(u.id, { gameId: g.id, awayDigit: 2, homeDigit: 4, stake: 100 })
    expect(await prisma.bet.count()).toBe(2)
  })

  it('rejects insufficient balance and creates nothing', async () => {
    const u = await makeUser()
    await fundUser(u.id, 50)
    const g = await makeGame()
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 51 })).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    })
    expect(await prisma.bet.count()).toBe(0)
    expect(await balanceOf(u.id)).toBe(50)
  })

  it('closes betting exactly at tip-off', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const startsAt = new Date('2026-11-11T23:00:00Z')
    const g = await makeGame({ startsAt })
    await expect(
      placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 }, startsAt),
    ).rejects.toMatchObject({ code: 'BETTING_CLOSED' })
    const ok = await placeBet(
      u.id,
      { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 },
      new Date(startsAt.getTime() - 1000),
    )
    expect(ok.stake).toBe(10)
  })

  it.each(['LIVE', 'FINAL', 'SETTLED', 'VOID', 'POSTPONED'] as const)('rejects bets on %s games', async (status) => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ status })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })).rejects.toMatchObject({
      code: 'BETTING_CLOSED',
    })
  })

  it('rejects an unknown game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    await expect(placeBet(u.id, { gameId: 'nope', awayDigit: 1, homeDigit: 1, stake: 10 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects suspended players but allows expired suspensions', async () => {
    const u = await makeUser({ status: 'SUSPENDED' })
    await fundUser(u.id, 100)
    const g = await makeGame()
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })).rejects.toMatchObject({
      code: 'SUSPENDED',
    })
    await prisma.user.update({ where: { id: u.id }, data: { suspendedUntil: new Date(Date.now() - 1000) } })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })).resolves.toBeTruthy()
  })

  it('enforces the per-game stake limit across all endings', async () => {
    const u = await makeUser({ stakeLimitPerGame: 100 })
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 60 })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 50 })).rejects.toMatchObject({
      code: 'STAKE_LIMIT',
      message: 'Stake limit exceeded (remaining: 40)',
    })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 40 })).resolves.toBeTruthy()
  })

  it('concurrent bets cannot overdraw the balance', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g1 = await makeGame()
    const g2 = await makeGame()
    const results = await Promise.allSettled([
      placeBet(u.id, { gameId: g1.id, awayDigit: 1, homeDigit: 1, stake: 80 }),
      placeBet(u.id, { gameId: g2.id, awayDigit: 1, homeDigit: 1, stake: 80 }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balanceOf(u.id)).toBe(20)
    await expectLedgerConsistent()
  })

  // Review Focus #1: junk numeric form input
  it.each([
    { stake: '' },
    { stake: '10.5' },
    { stake: '-5' },
    { stake: 'abc' },
    { stake: '0' },
    { stake: '1e3' },
    { awayDigit: '' },
    { awayDigit: '10' },
    { homeDigit: '-1' },
  ])('rejects junk input %o', async (override) => {
    const u = await makeUser()
    await fundUser(u.id, 10_000)
    const g = await makeGame()
    await expect(
      placeBet(u.id, { gameId: g.id, awayDigit: '1', homeDigit: '1', stake: '10', ...override }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await prisma.bet.count()).toBe(0)
  })
})
