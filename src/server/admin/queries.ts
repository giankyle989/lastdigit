import type { GameStatus, TransactionType } from '@prisma/client'

import { prisma } from '@/lib/db'

export function getPlayerDetail(id: string) {
  return prisma.user.findFirst({
    where: { id, role: 'PLAYER' },
    // The result is rendered into a client-visible drawer: never ship the password hash.
    omit: { passwordHash: true },
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
