import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { settleGame, voidGame } from '@/server/settlement'
import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).balance
}

async function setupGame() {
  const a = await makeUser({ username: 'a' })
  const b = await makeUser({ username: 'b' })
  const c = await makeUser({ username: 'c' })
  for (const u of [a, b, c]) await fundUser(u.id, 1000)
  const g = await makeGame()
  await placeBet(a.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
  await placeBet(b.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 300 })
  await placeBet(c.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 600 })
  await prisma.game.update({ where: { id: g.id }, data: { status: 'FINAL', awayScore: 99, homeScore: 106 } })
  return { a, b, c, g }
}

describe('settleGame', () => {
  beforeEach(resetDb)

  it('pays winners pro-rata from 90% of the pool', async () => {
    const { a, b, c, g } = await setupGame()
    expect(await settleGame(g.id)).toEqual({ settled: true })
    expect(await balanceOf(a.id)).toBe(900 + 225)
    expect(await balanceOf(b.id)).toBe(700 + 675)
    expect(await balanceOf(c.id)).toBe(400)
    const game = await prisma.game.findUniqueOrThrow({ where: { id: g.id } })
    expect(game).toMatchObject({ status: 'SETTLED', pool: 1000, houseTake: 100 })
    expect(game.settledAt).not.toBeNull()
    const bets = await prisma.bet.findMany({ orderBy: { stake: 'asc' } })
    expect(bets.map((x) => [x.result, x.payout])).toEqual([
      ['WON', 225],
      ['WON', 675],
      ['LOST', 0],
    ])
    expect(await prisma.transaction.count({ where: { type: 'PAYOUT' } })).toBe(2)
    await expectLedgerConsistent()
  })

  it('house keeps everything when nobody wins', async () => {
    const { a, g } = await setupGame()
    await prisma.game.update({ where: { id: g.id }, data: { awayScore: 100, homeScore: 100 } })
    await settleGame(g.id)
    expect(await balanceOf(a.id)).toBe(900)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).houseTake).toBe(1000)
    expect(await prisma.bet.count({ where: { result: 'LOST' } })).toBe(3)
  })

  it('is idempotent: a second run pays nothing', async () => {
    const { a, g } = await setupGame()
    await settleGame(g.id)
    expect(await settleGame(g.id)).toEqual({ settled: false })
    expect(await balanceOf(a.id)).toBe(1125)
    await expectLedgerConsistent()
  })

  it('concurrent runs settle once', async () => {
    const { a, g } = await setupGame()
    const results = await Promise.all([settleGame(g.id), settleGame(g.id)])
    expect(results.filter((r) => r.settled)).toHaveLength(1)
    expect(await balanceOf(a.id)).toBe(1125)
  })

  it('does nothing for non-final games', async () => {
    const g = await makeGame({ status: 'LIVE' })
    expect(await settleGame(g.id)).toEqual({ settled: false })
  })

  it('settles a game with no bets', async () => {
    const g = await makeGame({ status: 'FINAL', awayScore: 99, homeScore: 106 })
    await settleGame(g.id)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'SETTLED',
      pool: 0,
      houseTake: 0,
    })
  })
})

describe('voidGame', () => {
  beforeEach(resetDb)

  it('refunds all stakes on an unsettled game', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { a, b, c, g } = await setupGame()
    await voidGame(admin.id, g.id, 'Postponed')
    for (const u of [a, b, c]) expect(await balanceOf(u.id)).toBe(1000)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'VOID',
      voidReason: 'Postponed',
      houseTake: 0,
    })
    expect(await prisma.bet.count({ where: { result: 'REFUNDED' } })).toBe(3)
    expect(await prisma.adminAction.count({ where: { action: 'VOID_GAME' } })).toBe(1)
    await expectLedgerConsistent()
  })

  it('reverses payouts on a settled game', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { a, b, c, g } = await setupGame()
    await settleGame(g.id)
    await voidGame(admin.id, g.id, 'Wrong score')
    for (const u of [a, b, c]) expect(await balanceOf(u.id)).toBe(1000)
    const reversals = await prisma.transaction.findMany({ where: { type: 'REFUND', amount: { lt: 0 } } })
    expect(reversals.map((t) => t.amount).sort((x, y) => x - y)).toEqual([-675, -225])
    expect((await prisma.bet.findMany()).every((x) => x.payout === 0)).toBe(true)
    await expectLedgerConsistent()
  })

  it('does not refund bets that are already REFUNDED', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { a, b, c, g } = await setupGame()
    await voidGame(admin.id, g.id, 'First')
    await prisma.game.update({ where: { id: g.id }, data: { status: 'POSTPONED' } }) // simulates the old sync overwrite
    await voidGame(admin.id, g.id, 'Second')
    for (const u of [a, b, c]) expect(await balanceOf(u.id)).toBe(1000)
    await expectLedgerConsistent()
  })

  it('a reversal can leave a negative balance', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const winner = await makeUser({ username: 'w' })
    const loser = await makeUser({ username: 'l' })
    await fundUser(winner.id, 100)
    await fundUser(loser.id, 900)
    const g = await makeGame()
    await placeBet(winner.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await placeBet(loser.id, { gameId: g.id, awayDigit: 0, homeDigit: 0, stake: 900 })
    await prisma.game.update({
      where: { id: g.id },
      data: { status: 'FINAL', awayScore: 99, homeScore: 106 },
    })
    await settleGame(g.id) // winner gets 900
    const g2 = await makeGame()
    await placeBet(winner.id, { gameId: g2.id, awayDigit: 1, homeDigit: 1, stake: 900 }) // spends it
    await voidGame(admin.id, g.id, 'Bad data')
    expect(await balanceOf(winner.id)).toBe(100 - 900) // +100 refund, -900 reversal from 0
    await expectLedgerConsistent()
  })

  it('rejects voiding twice, empty reasons and unknown games', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const g = await makeGame()
    await expect(voidGame(admin.id, g.id, '  ')).rejects.toMatchObject({ code: 'VALIDATION' })
    await voidGame(admin.id, g.id, 'Cancelled')
    await expect(voidGame(admin.id, g.id, 'Again')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(voidGame(admin.id, 'nope', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('races settle against void: both resolve and the game ends VOID with stakes refunded', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { a, b, c, g } = await setupGame()
    const results = await Promise.allSettled([settleGame(g.id), voidGame(admin.id, g.id, 'race')])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('VOID')
    for (const u of [a, b, c]) expect(await balanceOf(u.id)).toBe(1000)
    await expectLedgerConsistent()
  })

  it('a voided game cannot be settled', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { g } = await setupGame()
    await voidGame(admin.id, g.id, 'Bad data')
    expect(await settleGame(g.id)).toEqual({ settled: false })
  })
})
