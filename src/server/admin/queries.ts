import type { GameStatus, TransactionType } from '@prisma/client'

import { prisma } from '@/lib/db'

import { getLastSyncAt } from '../settings'

const SYNC_STALE_MS = 30 * 60 * 1000

export async function getDashboardStats(now: Date = new Date()) {
  const [playerCount, openPools, house, openInquiries, negativeBalances, lastSyncAt, postponedCount] =
    await Promise.all([
      prisma.user.count({ where: { role: 'PLAYER' } }),
      prisma.game.aggregate({
        where: { status: { in: ['SCHEDULED', 'LIVE', 'FINAL'] }, pool: { gt: 0 } },
        _sum: { pool: true },
        _count: true,
      }),
      prisma.game.aggregate({ where: { status: 'SETTLED' }, _sum: { houseTake: true } }),
      prisma.inquiry.count({ where: { status: 'OPEN' } }),
      prisma.user.findMany({
        where: { balance: { lt: 0 } },
        select: { id: true, username: true, balance: true },
        orderBy: { balance: 'asc' },
      }),
      getLastSyncAt(),
      prisma.game.count({ where: { status: 'POSTPONED' } }),
    ])
  return {
    playerCount,
    openPoolCount: openPools._count,
    openPoolTotal: openPools._sum.pool ?? 0,
    houseTakeTotal: house._sum.houseTake ?? 0,
    openInquiries,
    negativeBalances,
    lastSyncAt,
    syncStale: !lastSyncAt || now.getTime() - lastSyncAt.getTime() > SYNC_STALE_MS,
    postponedCount,
  }
}

export function searchPlayers(q?: string) {
  const key = q?.trim().toLowerCase()
  return prisma.user.findMany({
    where: { role: 'PLAYER', ...(key ? { usernameKey: { contains: key } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export function getPlayerDetail(id: string) {
  return prisma.user.findFirst({
    where: { id, role: 'PLAYER' },
    include: {
      referredBy: { select: { id: true, username: true } },
      referrals: { select: { id: true, username: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      bets: { include: { game: true }, orderBy: { createdAt: 'desc' }, take: 50 },
      transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
}

export function listGamesAdmin(status?: GameStatus) {
  return prisma.game.findMany({
    where: status ? { status } : {},
    orderBy: { startsAt: 'desc' },
    take: 200,
    include: { _count: { select: { bets: { where: { result: 'WON' } } } } },
  })
}

export function listTransactionsAdmin(f: {
  username?: string
  type?: TransactionType
  from?: Date
  to?: Date
}) {
  const username = f.username?.trim().toLowerCase()
  return prisma.transaction.findMany({
    where: {
      ...(username ? { user: { usernameKey: username } } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.from || f.to
        ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } }
        : {}),
    },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
}

export function listAdminActions() {
  return prisma.adminAction.findMany({
    include: { admin: { select: { username: true } }, targetUser: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
