import type { BetResult } from '@prisma/client'

import { prisma } from '@/lib/db'

export function listUpcomingGames(now: Date = new Date()) {
  return prisma.game.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - 36 * 3600_000) } },
    orderBy: { startsAt: 'asc' },
    take: 100,
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

export function listMyBets(userId: string, result?: BetResult) {
  return prisma.bet.findMany({
    where: { userId, ...(result ? { result } : {}) },
    include: { game: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export function listMyTransactions(userId: string) {
  return prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 })
}

export function listMyReferrals(userId: string) {
  return prisma.user.findMany({
    where: { referredById: userId },
    select: { username: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}
