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

  it('refuses staff accounts: managers and superadmins do not bet', async () => {
    const g = await makeGame()
    for (const role of ['MANAGER', 'SUPERADMIN'] as const) {
      const staff = await makeUser({ role })
      await fundUser(staff.id, 1000)
      await expect(
        placeBets(staff.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 10 }]),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    expect(await prisma.bet.count()).toBe(0)
    await expectLedgerConsistent()
  })

  it('places every pick, merging same-ending picks, in one go', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g1 = await makeGame()
    const g2 = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK' })
    const bets = await placeBets(u.id, 'WALLET', [
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
    const err = await placeBets(u.id, 'WALLET', [
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

  it('rejects a slip whose total exceeds the balance, naming the account and its balance', async () => {
    const u = await makeUser()
    await fundUser(u.id, 150)
    const g = await makeGame()
    await expect(
      placeBets(u.id, 'WALLET', [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      ]),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Not enough in the wallet (₱150).',
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
    await placeBet(u.id, 'WALLET', { gameId: g.id, awayDigit: 0, homeDigit: 0, stake: 30 })
    await expect(
      placeBets(u.id, 'WALLET', [
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
      placeBets(u.id, 'WALLET', [
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
      placeBets(u.id, 'WALLET', [
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
      placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 }]),
    ).rejects.toMatchObject({ code: 'BETTING_CLOSED', message: 'Betting closed', pickIndex: 0 })
  })

  it.each([
    [[]],
    [Array.from({ length: 101 }, () => ({ gameId: 'g', awayDigit: 1, homeDigit: 1, stake: 1 }))],
    ['nope'],
  ])('rejects an empty, oversized or malformed slip (%#)', async (input) => {
    const u = await makeUser()
    await expect(placeBets(u.id, 'WALLET', input)).rejects.toBeInstanceOf(ZodError)
  })

  const endings = (gameId: string, from: number, count: number, stake = 1) =>
    Array.from({ length: count }, (_, i) => ({
      gameId,
      awayDigit: Math.floor((from + i) / 10),
      homeDigit: (from + i) % 10,
      stake,
    }))

  it('places a 100-pick slip spread over five games, 20 endings each', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const games = await Promise.all(Array.from({ length: 5 }, () => makeGame()))
    const bets = await placeBets(
      u.id,
      'WALLET',
      games.flatMap((g) => endings(g.id, 0, 20)),
    )
    expect(bets).toHaveLength(100)
    expect(await balanceOf(u.id)).toBe(0)
    for (const g of games) expect(await poolOf(g.id)).toBe(20)
    await expectLedgerConsistent()
  })

  it('refuses a 21st ending on one game and places nothing', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame()
    await expect(placeBets(u.id, 'WALLET', endings(g.id, 0, 21))).rejects.toMatchObject({
      code: 'ENDING_LIMIT',
      message: expect.stringContaining('At most 20 endings per game (20 left)'),
      pickIndex: 20,
    })
    expect(await prisma.bet.count({ where: { userId: u.id } })).toBe(0)
    expect(await balanceOf(u.id)).toBe(100)
  })

  it('counts endings already placed on the game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame()
    await placeBets(u.id, 'WALLET', endings(g.id, 0, 15))
    await expect(placeBets(u.id, 'WALLET', endings(g.id, 15, 6))).rejects.toMatchObject({
      code: 'ENDING_LIMIT',
      message: expect.stringContaining('(5 left)'),
    })
    expect(await prisma.bet.count({ where: { userId: u.id } })).toBe(15)
    expect(await balanceOf(u.id)).toBe(85)
    await placeBets(u.id, 'WALLET', endings(g.id, 15, 5))
    // Topping up an ending already held doesn't need room.
    await placeBets(u.id, 'WALLET', endings(g.id, 0, 3))
    expect(await prisma.bet.count({ where: { userId: u.id } })).toBe(20)
    expect(await balanceOf(u.id)).toBe(77)
    await expectLedgerConsistent()
  })

  it('two slips sent at once cannot pass 20 endings on a game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame()
    const results = await Promise.allSettled([
      placeBets(u.id, 'WALLET', endings(g.id, 0, 15)),
      placeBets(u.id, 'WALLET', endings(g.id, 50, 15)),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((r) => r.status === 'rejected')
    expect(failed?.status === 'rejected' && failed.reason).toMatchObject({ code: 'ENDING_LIMIT' })
    expect(await prisma.bet.count({ where: { userId: u.id } })).toBe(15)
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
    const results = await Promise.allSettled([
      placeBets(u.id, 'WALLET', slipA),
      placeBets(u.id, 'WALLET', slipB),
    ])
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
          'WALLET',
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

  it('a points slip and a wallet slip on one ending are each charged to their own account', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 60, 'POINTS')
    await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 60 }])
    const [bet] = await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 40 }])
    expect(bet).toMatchObject({ stake: 100, pointsStake: 60 })
    expect(await balancesOf(u.id)).toEqual({ wallet: 460, points: 0 })
    const rows = await prisma.transaction.findMany({ where: { type: 'BET' }, orderBy: { account: 'asc' } })
    expect(rows.map((r) => [r.account, r.amount])).toEqual([
      ['WALLET', -40],
      ['POINTS', -60],
    ])
    await expectLedgerConsistent()
  })

  it('splits a stake across two slips, one per account, with the same totals', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 150, 'POINTS')
    await placeBets(u.id, 'POINTS', [
      { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
      { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 50 },
    ])
    await placeBets(u.id, 'WALLET', [
      { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 50 },
      { gameId: g.id, awayDigit: 3, homeDigit: 3, stake: 100 },
    ])
    const bets = await prisma.bet.findMany({ where: { userId: u.id }, orderBy: { awayDigit: 'asc' } })
    expect(bets.map((b) => b.stake)).toEqual([100, 100, 100])
    expect(bets.map((b) => b.pointsStake)).toEqual([100, 50, 0])
    expect(await balancesOf(u.id)).toEqual({ wallet: 350, points: 0 })
    await expectLedgerConsistent()
  })

  it('grows stake and pointsStake together on a repeat bet', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 30, 'POINTS')
    await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 20 }])
    await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 10 }])
    const [bet] = await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 40 }])
    expect(bet).toMatchObject({ stake: 70, pointsStake: 30 })
  })

  it('refuses a slip larger than the chosen balance even when both together cover it', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 100, 'WALLET')
    await fundUser(u.id, 50, 'POINTS')
    await expect(
      placeBets(u.id, 'WALLET', [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 51 },
      ]),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Not enough in the wallet (₱100).',
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
    const [bet] = await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 5, homeDigit: 5, stake: 100 }])
    expect(bet?.pointsStake).toBe(0)
    expect(await balancesOf(u.id)).toEqual({ wallet: 100, points: -40 })
  })

  it('two slips sent at once cannot spend the same points twice', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 100, 'POINTS')
    const results = await Promise.allSettled([
      placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 80 }]),
      placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 80 }]),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    // The loser was refused for funds (serialized by the player lock), not by a deadlock.
    const refused = results.find((r) => r.status === 'rejected')
    expect(refused?.status === 'rejected' && refused.reason).toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
    expect(await balancesOf(u.id)).toEqual({ wallet: 0, points: 20 })
    await expectLedgerConsistent()
  })
  it('a points slip spends only points', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    await fundUser(u.id, 200, 'POINTS')
    const g = await makeGame()
    const [bet] = await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 150 }])
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect([after.walletBalance, after.pointsBalance]).toEqual([500, 50])
    expect(bet).toMatchObject({ stake: 150, pointsStake: 150 })
    await expectLedgerConsistent()
  })

  it('a wallet slip spends only the wallet, even with points available', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    await fundUser(u.id, 200, 'POINTS')
    const g = await makeGame()
    const [bet] = await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 150 }])
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect([after.walletBalance, after.pointsBalance]).toEqual([350, 200])
    expect(bet).toMatchObject({ stake: 150, pointsStake: 0 })
  })

  it('refuses when the chosen balance is short, never topping up from the other', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    await fundUser(u.id, 40, 'POINTS')
    const g = await makeGame()
    const picks = [
      { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 30 },
      { gameId: g.id, awayDigit: 3, homeDigit: 4, stake: 30 },
    ]
    await expect(placeBets(u.id, 'POINTS', picks)).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Not enough points (40 pts).',
    })
    await expect(
      placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 1001 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet (₱1,000).' })
    expect(await prisma.bet.count()).toBe(0)
    await expectLedgerConsistent()
  })

  it('counts a negative chosen balance as 0', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500, 'POINTS')
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'WALLET', type: 'REFUND', amount: -10 }),
    )
    const g = await makeGame()
    await expect(
      placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 1 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet (₱0).' })
  })

  it('requires an account', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    const g = await makeGame()
    const pick = [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 10 }]
    await expect(placeBets(u.id, undefined, pick)).rejects.toBeInstanceOf(ZodError)
    await expect(placeBets(u.id, 'BOTH', pick)).rejects.toBeInstanceOf(ZodError)
  })

  it('merges a wallet and a points bet on one ending into one row', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    await fundUser(u.id, 500, 'POINTS')
    const g = await makeGame()
    await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 7, homeDigit: 3, stake: 60 }])
    await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 7, homeDigit: 3, stake: 40 }])
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: u.id } })
    expect(bet).toMatchObject({ stake: 100, pointsStake: 40 })
    await expectLedgerConsistent()
  })
})

describe('placeBets and suspension', () => {
  beforeEach(resetDb)

  it('a suspension committed while a slip waits on the player lock refuses the slip', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let locked!: () => void
    const isLocked = new Promise<void>((r) => (locked = r))
    // Staff hold the player row, then suspend them while the slip is queued behind the lock.
    const staff = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${u.id} FOR UPDATE`
      locked()
      await gate
      await tx.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } })
    })
    await isLocked
    const slip = placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 50 }])
    await new Promise((r) => setTimeout(r, 300)) // let the slip reach the player lock
    release()
    await staff
    await expect(slip).rejects.toMatchObject({ code: 'SUSPENDED' })
    expect(await prisma.bet.count({ where: { userId: u.id } })).toBe(0)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).walletBalance).toBe(100)
  })
})
