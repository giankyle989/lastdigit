import type { Bet, BetResult, Game } from '@prisma/client'
import { z } from 'zod'

import { etDayRange } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { formatEnding } from '@/lib/game/ending'
import { MAX_SLIP_PICKS } from '@/lib/game/limits'
import { isBettingOpen } from '@/lib/game/status'
import { BET_TAB_RESULTS, type BetTab } from '@/lib/my-bets'
import { type Page, pageWindow } from '@/lib/pagination'
import { WALLET_FILTER_TYPES, type WalletFilter } from '@/lib/wallet'

export const BET_GROUPS_PER_PAGE = 20
export const TRANSACTIONS_PER_PAGE = 50

export type FeedGame = Game & { myPickCount: number }

/** Games whose tip-off falls on the ET date, soonest first, with the viewer's pick count. */
export async function listGamesForDate(etDate: string, userId: string): Promise<FeedGame[]> {
  const { start, end } = etDayRange(etDate)
  const games = await prisma.game.findMany({
    where: { startsAt: { gte: start, lt: end } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })
  if (games.length === 0) return []
  const counts = await prisma.bet.groupBy({
    by: ['gameId'],
    where: { userId, gameId: { in: games.map((g) => g.id) } },
    _count: { _all: true },
  })
  const byGame = new Map(counts.map((c) => [c.gameId, c._count._all]))
  return games.map((g) => ({ ...g, myPickCount: byGame.get(g.id) ?? 0 }))
}

/** Replaced by listGamesForDate; removed in Task 9 with the old games page. */
export function listUpcomingGames(now: Date = new Date()) {
  return prisma.game.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - 36 * 3600_000) } },
    orderBy: { startsAt: 'asc' },
    take: 100,
  })
}

/** Replaced by listMyBetsGrouped; removed in Task 10 with the old bets page. */
export function listMyBets(userId: string, result?: BetResult) {
  return prisma.bet.findMany({
    where: { userId, ...(result ? { result } : {}) },
    include: { game: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function getGameForPlayer(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return null
  const [myBets, winners] = await Promise.all([
    prisma.bet.findMany({ where: { gameId, userId }, orderBy: [{ awayDigit: 'asc' }, { homeDigit: 'asc' }] }),
    prisma.bet.count({ where: { gameId, result: 'WON' } }),
  ])
  return { game, myBets, winners }
}

export type BetGroup = { game: Game; bets: Bet[] }

/** The viewer's bets for one tab, grouped by game (latest tip-off first), 20 games per page. */
export async function listMyBetsGrouped(userId: string, tab: BetTab, page: number): Promise<Page<BetGroup>> {
  const where = { bets: { some: { userId, result: { in: BET_TAB_RESULTS[tab] } } } }
  const total = await prisma.game.count({ where })
  const w = pageWindow(total, page, BET_GROUPS_PER_PAGE)
  const games = await prisma.game.findMany({
    where,
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    skip: w.skip,
    take: w.take,
    include: {
      bets: {
        where: { userId, result: { in: BET_TAB_RESULTS[tab] } },
        orderBy: [{ awayDigit: 'asc' }, { homeDigit: 'asc' }],
      },
    },
  })
  return {
    rows: games.map(({ bets, ...game }) => ({ game, bets })),
    total,
    page: w.page,
    pageCount: w.pageCount,
  }
}

/** The viewer's ledger, newest first, 50 per page, filtered by wallet chip (spec §4.5). */
export async function listMyTransactions(userId: string, filter: WalletFilter, page: number) {
  const types = WALLET_FILTER_TYPES[filter]
  const where = { userId, ...(types ? { type: { in: types } } : {}) }
  const total = await prisma.transaction.count({ where })
  const w = pageWindow(total, page, TRANSACTIONS_PER_PAGE)
  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: w.skip,
    take: w.take,
    include: { game: { select: { awayTeam: true, homeTeam: true } } },
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}

export function listMyReferrals(userId: string) {
  return prisma.user.findMany({
    where: { referredById: userId },
    select: { username: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

const slipKeysSchema = z
  .array(
    z.object({
      gameId: z.string().min(1).max(64),
      awayDigit: z.number().int().min(0).max(9),
      homeDigit: z.number().int().min(0).max(9),
    }),
  )
  .max(MAX_SLIP_PICKS)

export type PickStatus = {
  gameId: string
  awayDigit: number
  homeDigit: number
  /** "LAL @ GSW", or "Unknown game". */
  matchup: string
  open: boolean
  pool: number
  /** Stake already on this ending (non-refunded), for the estimate. */
  endingStake: number
}

export type SlipStatus = { balance: number; picks: PickStatus[] }

/** Fresh data for the bet slip: balance plus, per pick, whether its game is open, the pool and the ending stake. */
export async function getSlipStatus(
  userId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<SlipStatus> {
  const keys = slipKeysSchema.parse(input)
  const gameIds = [...new Set(keys.map((k) => k.gameId))]
  const [user, games, sums] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } }),
    prisma.game.findMany({ where: { id: { in: gameIds } } }),
    prisma.bet.groupBy({
      by: ['gameId', 'awayDigit', 'homeDigit'],
      where: { gameId: { in: gameIds }, result: { not: 'REFUNDED' } },
      _sum: { stake: true },
    }),
  ])
  const gameById = new Map(games.map((g) => [g.id, g]))
  const stakeBy = new Map(sums.map((s) => [`${s.gameId}:${formatEnding(s)}`, s._sum.stake ?? 0]))
  return {
    balance: user.balance,
    picks: keys.map((k) => {
      const game = gameById.get(k.gameId)
      return {
        ...k,
        matchup: game ? `${game.awayTeam} @ ${game.homeTeam}` : 'Unknown game',
        open: game ? isBettingOpen(game, now) : false,
        pool: game?.pool ?? 0,
        endingStake: stakeBy.get(`${k.gameId}:${formatEnding(k)}`) ?? 0,
      }
    }),
  }
}
