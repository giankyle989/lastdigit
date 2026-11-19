import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { placeBet, placeBets } from '@/server/bets'
import { postEntry } from '@/server/ledger'

import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalance
}
async function poolOf(id: string) {
  return (await prisma.game.findUniqueOrThrow({ where: { id } })).pool
}

describe('placeBets', () => {
  beforeEach(resetDb)

  it('places every pick, merging same-ending picks, in one go', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g1 = await makeGame()
    const g2 = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK' })
    const bets = await placeBets(u.id, [
      { gameId: g1.id, awayDigit: 9, homeDigit: 6, stake: 100 },
      { gameId: g2.id, awayDigit: 0, homeDigit: 0, stake: 50 },
      { gameId: g1.id, awayDigit: 9, homeDigit: 6, stake: 25 },
    ])
    expect(bets).toHaveLength(3)
    expect(await balanceOf(u.id)).toBe(825)
    expect(await poolOf(g1.id)).toBe(125)
    expect(await poolOf(g2.id)).toBe(50)
    expect(await prisma.bet.count()).toBe(2)
    expect(
      (await prisma.bet.findFirstOrThrow({ where: { gameId: g1.id, awayDigit: 9, homeDigit: 6 } })).stake,
    ).toBe(125)
    expect(await prisma.transaction.count({ where: { type: 'BET' } })).toBe(3)
    await expectLedgerConsistent()
  })

  it('rolls everything back when one pick is closed, naming the pick', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const open = await makeGame()
    const closed = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK', status: 'LIVE' })
    const err = await placeBets(u.id, [
      { gameId: open.id, awayDigit: 1, homeDigit: 2, stake: 100 },
      { gameId: closed.id, awayDigit: 9, homeDigit: 6, stake: 100 },
    ]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({
      code: 'BETTING_CLOSED',
      message: 'BOS @ NYK 9-6: Betting closed',
      pickIndex: 1,
    })
    expect(await balanceOf(u.id)).toBe(1000)
    expect(await poolOf(open.id)).toBe(0)
    expect(await prisma.bet.count()).toBe(0)
    await expectLedgerConsistent()
  })

  it('rejects a slip whose total exceeds the balance, flagging the pick that ran out', async () => {
    const u = await makeUser()
    await fundUser(u.id, 150)
    const g = await makeGame()
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      ]),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'LAL @ GSW 2-2: Not enough balance',
      pickIndex: 1,
    })
    expect(await balanceOf(u.id)).toBe(150)
    expect(await poolOf(g.id)).toBe(0)
    expect(await prisma.bet.count()).toBe(0)
  })

  it('counts earlier slip picks and existing bets toward the per-game stake limit', async () => {
    const u = await makeUser({ stakeLimitPerGame: 100 })
    await fundUser(u.id, 1000)
    const g = await makeGame()
    const other = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 0, homeDigit: 0, stake: 30 })
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 40 },
        { gameId: other.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 40 },
      ]),
    ).rejects.toMatchObject({
      code: 'STAKE_LIMIT',
      message: 'LAL @ GSW 2-2: Stake limit exceeded (remaining: 30)',
      pickIndex: 2,
    })
    expect(await prisma.bet.count()).toBe(1)
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 40 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 30 },
      ]),
    ).resolves.toHaveLength(2)
  })

  it('names an unknown game by its position', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 },
        { gameId: 'missing', awayDigit: 1, homeDigit: 1, stake: 10 },
      ]),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Pick 2: Game not found', pickIndex: 1 })
  })

  it('keeps single-pick errors unprefixed', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame({ status: 'FINAL' })
    await expect(
      placeBets(u.id, [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 }]),
    ).rejects.toMatchObject({ code: 'BETTING_CLOSED', message: 'Betting closed', pickIndex: 0 })
  })

  it.each([
    [[]],
    [Array.from({ length: 101 }, () => ({ gameId: 'g', awayDigit: 1, homeDigit: 1, stake: 1 }))],
    ['nope'],
  ])('rejects an empty, oversized or malformed slip (%#)', async (input) => {
    const u = await makeUser()
    await expect(placeBets(u.id, input)).rejects.toBeInstanceOf(ZodError)
  })

  it('places a 100-pick slip covering every ending of a game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame()
    const picks = Array.from({ length: 100 }, (_, i) => ({
      gameId: g.id,
      awayDigit: Math.floor(i / 10),
      homeDigit: i % 10,
      stake: 1,
    }))
    const bets = await placeBets(u.id, picks)
    expect(bets).toHaveLength(100)
    expect(await balanceOf(u.id)).toBe(0)
    expect(await poolOf(g.id)).toBe(100)
    await expectLedgerConsistent()
  })

  it('concurrent overlapping slips neither deadlock nor overspend', async () => {
    const u = await makeUser()
    await fundUser(u.id, 300)
    const g1 = await makeGame()
    const g2 = await makeGame()
    const slipA = [
      { gameId: g1.id, awayDigit: 1, homeDigit: 1, stake: 100 },
      { gameId: g2.id, awayDigit: 1, homeDigit: 1, stake: 100 },
    ]
    const slipB = [
      { gameId: g2.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      { gameId: g1.id, awayDigit: 2, homeDigit: 2, stake: 100 },
    ]
    const results = await Promise.allSettled([placeBets(u.id, slipA), placeBets(u.id, slipB)])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.status === 'rejected' && failed[0].reason).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    })
    expect(await balanceOf(u.id)).toBe(100)
    expect((await poolOf(g1.id)) + (await poolOf(g2.id))).toBe(200)
    await expectLedgerConsistent()
  })

  it('many concurrent slips from different players on shared games all succeed', async () => {
    const users = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()])
    for (const u of users) await fundUser(u.id, 1000)
    const games = await Promise.all([makeGame(), makeGame(), makeGame()])
    const ids = games.map((g) => g.id)
    await Promise.all(
      users.map((u, i) =>
        placeBets(
          u.id,
          (i % 2 === 0 ? ids : [...ids].reverse()).map((gameId) => ({
            gameId,
            awayDigit: i,
            homeDigit: i,
            stake: 10,
          })),
        ),
      ),
    )
    for (const g of games) expect(await poolOf(g.id)).toBe(40)
    await expectLedgerConsistent()
  })

  async function balancesOf(id: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } })
    return { wallet: u.walletBalance, points: u.pointsBalance }
  }

  it('pays a stake from points first, then the wallet', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 60, 'POINTS')
    const [bet] = await placeBets(u.id, [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 100 }])
    expect(bet).toMatchObject({ stake: 100, pointsStake: 60 })
    expect(await balancesOf(u.id)).toEqual({ wallet: 460, points: 0 })
    const rows = await prisma.transaction.findMany({ where: { type: 'BET' }, orderBy: { account: 'asc' } })
    expect(rows.map((r) => [r.account, r.amount])).toEqual([
      ['WALLET', -40],
      ['POINTS', -60],
    ])
    await expectLedgerConsistent()
  })

  it('crosses from points to the wallet partway through a slip', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 150, 'POINTS')
    const bets = await placeBets(u.id, [
      { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
      { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      { gameId: g.id, awayDigit: 3, homeDigit: 3, stake: 100 },
    ])
    expect(bets.map((b) => b.pointsStake)).toEqual([100, 50, 0])
    expect(await balancesOf(u.id)).toEqual({ wallet: 350, points: 0 })
    await expectLedgerConsistent()
  })

  it('grows stake and pointsStake together on a repeat bet', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 30, 'POINTS')
    await placeBets(u.id, [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 20 }])
    const [bet] = await placeBets(u.id, [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 50 }])
    expect(bet).toMatchObject({ stake: 70, pointsStake: 30 })
  })

  it('refuses a slip larger than both balances together, placing nothing', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 100, 'WALLET')
    await fundUser(u.id, 50, 'POINTS')
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 51 },
      ]),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      pickIndex: 1,
      message: 'LAL @ GSW 2-2: Not enough balance',
    })
    expect(await prisma.bet.count()).toBe(0)
    expect(await balancesOf(u.id)).toEqual({ wallet: 100, points: 50 })
  })

  it('never spends from a negative balance', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 200, 'WALLET')
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'POINTS', type: 'REFUND', amount: -40 }),
    )
    const [bet] = await placeBets(u.id, [{ gameId: g.id, awayDigit: 5, homeDigit: 5, stake: 100 }])
    expect(bet?.pointsStake).toBe(0)
    expect(await balancesOf(u.id)).toEqual({ wallet: 100, points: -40 })
  })

  it('two slips sent at once cannot spend the same points twice', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 100, 'POINTS')
    const results = await Promise.allSettled([
      placeBets(u.id, [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 80 }]),
      placeBets(u.id, [{ gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 80 }]),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balancesOf(u.id)).toEqual({ wallet: 0, points: 20 })
    await expectLedgerConsistent()
  })
})
