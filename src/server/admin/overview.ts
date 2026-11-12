import { addDays, localDateOf, localDayRange, TIME_ZONE } from '@/lib/dates'
import { prisma } from '@/lib/db'

import { getLastSyncAt } from '../settings'

const SYNC_STALE_MS = 30 * 60 * 1000
const DAY_MS = 86_400_000
const ATTENTION_LIMIT = 10

export async function getOverviewStats(now: Date = new Date()) {
  const weekStart = localDayRange(addDays(localDateOf(now), -6)).start
  const [
    playerCount,
    newPlayers7d,
    openPools,
    houseTake7d,
    houseTakeAllTime,
    lastSyncAt,
    postponed,
    negativeBalances,
    openTickets,
    openTicketCount,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'PLAYER' } }),
    prisma.user.count({
      where: { role: 'PLAYER', createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
    }),
    prisma.game.aggregate({
      where: { status: { in: ['SCHEDULED', 'LIVE', 'FINAL'] }, pool: { gt: 0 } },
      _sum: { pool: true },
      _count: true,
    }),
    prisma.game.aggregate({
      where: { status: 'SETTLED', settledAt: { gte: weekStart } },
      _sum: { houseTake: true },
    }),
    prisma.game.aggregate({ where: { status: 'SETTLED' }, _sum: { houseTake: true } }),
    getLastSyncAt(),
    prisma.game.findMany({
      where: { status: 'POSTPONED' },
      select: { id: true, awayTeam: true, homeTeam: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
      take: ATTENTION_LIMIT,
    }),
    prisma.user.findMany({
      where: { balance: { lt: 0 } },
      select: { id: true, username: true, balance: true },
      orderBy: { balance: 'asc' },
      take: ATTENTION_LIMIT,
    }),
    prisma.inquiry.findMany({
      where: { status: 'OPEN' },
      select: { id: true, subject: true, user: { select: { username: true } } },
      orderBy: { updatedAt: 'asc' },
      take: ATTENTION_LIMIT,
    }),
    prisma.inquiry.count({ where: { status: 'OPEN' } }),
  ])
  return {
    playerCount,
    newPlayers7d,
    openPoolTotal: openPools._sum.pool ?? 0,
    openPoolCount: openPools._count,
    houseTake7d: houseTake7d._sum.houseTake ?? 0,
    houseTakeAllTime: houseTakeAllTime._sum.houseTake ?? 0,
    lastSyncAt,
    syncStale: !lastSyncAt || now.getTime() - lastSyncAt.getTime() > SYNC_STALE_MS,
    postponed,
    negativeBalances,
    openTickets: openTickets.map((t) => ({ id: t.id, subject: t.subject, username: t.user.username })),
    openTicketCount,
  }
}

export type DailyPoint = { date: string; volume: number; houseTake: number }

/**
 * The last `days` PHT days ending today (oldest first). volume = Σ|amount| of BET transactions
 * created that PHT day; houseTake = Σ houseTake of games settled that PHT day (spec §5.1).
 */
export async function getDailyVolume(days: number, now: Date = new Date()): Promise<DailyPoint[]> {
  const today = localDateOf(now)
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1))
  const first = dates[0] ?? today
  const start = localDayRange(first).start
  const end = localDayRange(today).end
  const [volumes, takes] = await Promise.all([
    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}::text, 'YYYY-MM-DD') AS day,
             SUM(ABS(amount))::bigint AS total
      FROM "Transaction"
      WHERE type = 'BET' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT to_char(("settledAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}::text, 'YYYY-MM-DD') AS day,
             SUM("houseTake")::bigint AS total
      FROM "Game"
      WHERE status = 'SETTLED' AND "settledAt" >= ${start} AND "settledAt" < ${end}
      GROUP BY 1`,
  ])
  const volumeBy = new Map(volumes.map((r) => [r.day, Number(r.total)]))
  const takeBy = new Map(takes.map((r) => [r.day, Number(r.total)]))
  return dates.map((date) => ({
    date,
    volume: volumeBy.get(date) ?? 0,
    houseTake: takeBy.get(date) ?? 0,
  }))
}

/** Top 5 players by BET volume in today's PHT day. */
export async function getTopBettorsToday(now: Date = new Date()) {
  const { start, end } = localDayRange(localDateOf(now))
  const groups = await prisma.transaction.groupBy({
    by: ['userId'],
    where: { type: 'BET', createdAt: { gte: start, lt: end } },
    _sum: { amount: true },
    orderBy: [{ _sum: { amount: 'asc' } }, { userId: 'asc' }],
    take: 5,
  })
  const users = await prisma.user.findMany({
    where: { id: { in: groups.map((g) => g.userId) } },
    select: { id: true, username: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.username]))
  return groups.map((g) => ({
    userId: g.userId,
    username: nameById.get(g.userId) ?? '—',
    volume: -(g._sum.amount ?? 0),
  }))
}

/** Sidebar badges: open ticket count, and whether the overview has anything needing attention. */
export async function getAdminBadges() {
  const [openTickets, postponed, negative] = await Promise.all([
    prisma.inquiry.count({ where: { status: 'OPEN' } }),
    prisma.game.count({ where: { status: 'POSTPONED' } }),
    prisma.user.count({ where: { balance: { lt: 0 } } }),
  ])
  return { openTickets, needsAttention: openTickets + postponed + negative > 0 }
}
