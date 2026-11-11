import type { GameStatus, TransactionType } from '@prisma/client'

import { prisma } from '@/lib/db'

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
