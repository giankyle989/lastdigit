import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { postEntry } from '@/server/ledger'
import {
  getSlipStatus,
  listGamesForDate,
  listMyBetsGrouped,
  listMyTransactions,
} from '@/server/queries/player'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('player feed queries', () => {
  beforeEach(resetDb)

  it('lists the games of one ET day with the viewer pick count', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(me.id, 1000)
    await fundUser(other.id, 1000)
    // ET day 2026-11-11 = [05:00Z Nov 11, 05:00Z Nov 12)
    const late = await makeGame({ startsAt: new Date('2026-11-12T03:30:00Z') }) // 22:30 ET Nov 11
    const early = await makeGame({ startsAt: new Date('2026-11-11T05:00:00Z') }) // 00:00 ET Nov 11
    await makeGame({ startsAt: new Date('2026-11-12T05:00:00Z') }) // Nov 12 ET
    await makeGame({ startsAt: new Date('2026-11-11T04:59:59Z') }) // Nov 10 ET
    const now = new Date('2026-11-10T12:00:00Z')
    await placeBet(me.id, { gameId: late.id, awayDigit: 1, homeDigit: 1, stake: 10 }, now)
    await placeBet(me.id, { gameId: late.id, awayDigit: 2, homeDigit: 2, stake: 10 }, now)
    await placeBet(other.id, { gameId: early.id, awayDigit: 1, homeDigit: 1, stake: 10 }, now)

    const games = await listGamesForDate('2026-11-11', me.id)
    expect(games.map((g) => [g.id, g.myPickCount])).toEqual([
      [early.id, 0],
      [late.id, 2],
    ])
    expect(await listGamesForDate('2026-12-25', me.id)).toEqual([])
  })

  it('groups my bets by game per tab and paginates by game', async () => {
    const me = await makeUser()
    await fundUser(me.id, 10_000)
    const now = new Date('2026-11-10T00:00:00Z')
    const games = []
    for (let i = 0; i < 22; i++) {
      games.push(await makeGame({ startsAt: new Date(Date.UTC(2026, 10, 11, i)) }))
    }
    for (const g of games) {
      await placeBet(me.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 1 }, now)
      await placeBet(me.id, { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 1 }, now)
    }
    // another player's bets must never show up for me
    const other = await makeUser()
    await fundUser(other.id, 100)
    const shared = games[5]
    if (!shared) throw new Error('setup')
    const theirs = await makeGame({ startsAt: new Date(Date.UTC(2026, 10, 12, 12)) })
    await placeBet(other.id, { gameId: shared.id, awayDigit: 3, homeDigit: 3, stake: 1 }, now)
    await placeBet(other.id, { gameId: theirs.id, awayDigit: 3, homeDigit: 3, stake: 1 }, now)
    const settled = games[0]
    if (!settled) throw new Error('setup')
    await prisma.bet.updateMany({ where: { gameId: settled.id, awayDigit: 1 }, data: { result: 'WON' } })
    await prisma.bet.updateMany({ where: { gameId: settled.id, awayDigit: 2 }, data: { result: 'LOST' } })

    const open1 = await listMyBetsGrouped(me.id, 'open', 1)
    expect(open1).toMatchObject({ total: 21, page: 1, pageCount: 2 })
    expect(open1.rows).toHaveLength(20)
    expect(open1.rows[0]?.game.id).toBe(games[21]?.id) // latest tip-off first
    expect(open1.rows[0]?.bets.map((b) => b.awayDigit)).toEqual([1, 2])
    expect(open1.rows.map((r) => r.game.id)).not.toContain(theirs.id)
    const sharedRow = open1.rows.find((r) => r.game.id === shared.id)
    expect(sharedRow?.bets.map((b) => b.userId)).toEqual([me.id, me.id])
    const open2 = await listMyBetsGrouped(me.id, 'open', 2)
    expect(open2.rows.map((r) => r.game.id)).toEqual([games[1]?.id])
    expect((await listMyBetsGrouped(me.id, 'open', 99)).page).toBe(2) // out of range clamps

    const settledTab = await listMyBetsGrouped(me.id, 'settled', 1)
    expect(settledTab.rows.map((r) => [r.game.id, r.bets.map((b) => b.result)])).toEqual([
      [settled.id, ['WON', 'LOST']],
    ])
    expect((await listMyBetsGrouped(me.id, 'refunded', 1)).rows).toEqual([])
  })

  it('filters and paginates my transactions', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(other.id, 5)
    for (let i = 0; i < 55; i++) {
      await prisma.$transaction((tx) => postEntry(tx, { userId: me.id, type: 'ADMIN_GRANT', amount: 1 }))
    }
    await prisma.$transaction((tx) => postEntry(tx, { userId: me.id, type: 'PAYOUT', amount: 90 }))

    const all = await listMyTransactions(me.id, 'all', 1)
    expect(all).toMatchObject({ total: 56, page: 1, pageCount: 2 })
    expect(all.rows).toHaveLength(50)
    expect(all.rows[0]?.type).toBe('PAYOUT')
    expect((await listMyTransactions(me.id, 'all', 2)).rows).toHaveLength(6)
    expect((await listMyTransactions(me.id, 'payouts', 1)).rows.map((t) => t.amount)).toEqual([90])
    expect((await listMyTransactions(me.id, 'admin', 1)).total).toBe(55)
    expect((await listMyTransactions(me.id, 'bonuses', 1)).total).toBe(0)
  })

  it('reports slip status: open flag, pool, stake on the ending and balance', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(me.id, 500)
    await fundUser(other.id, 500)
    const open = await makeGame()
    const live = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK' })
    await placeBet(other.id, { gameId: open.id, awayDigit: 9, homeDigit: 6, stake: 120 })
    await placeBet(other.id, { gameId: open.id, awayDigit: 0, homeDigit: 0, stake: 80 })
    await prisma.game.update({ where: { id: live.id }, data: { status: 'LIVE' } })

    const s = await getSlipStatus(me.id, [
      { gameId: open.id, awayDigit: 9, homeDigit: 6 },
      { gameId: live.id, awayDigit: 1, homeDigit: 1 },
      { gameId: 'gone', awayDigit: 1, homeDigit: 1 },
    ])
    expect(s.balance).toBe(500)
    expect(s.picks).toEqual([
      {
        gameId: open.id,
        awayDigit: 9,
        homeDigit: 6,
        matchup: 'LAL @ GSW',
        open: true,
        pool: 200,
        endingStake: 120,
      },
      {
        gameId: live.id,
        awayDigit: 1,
        homeDigit: 1,
        matchup: 'BOS @ NYK',
        open: false,
        pool: 0,
        endingStake: 0,
      },
      {
        gameId: 'gone',
        awayDigit: 1,
        homeDigit: 1,
        matchup: 'Unknown game',
        open: false,
        pool: 0,
        endingStake: 0,
      },
    ])
    await expect(
      getSlipStatus(me.id, [{ gameId: open.id, awayDigit: 10, homeDigit: 0 }]),
    ).rejects.toBeInstanceOf(ZodError)
  })
})
