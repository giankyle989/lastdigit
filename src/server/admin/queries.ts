import { prisma } from '@/lib/db'

import { getEndingStakes } from '../queries/stakes'

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

/** Game drawer: the game, its pool breakdown and its winning bets (with usernames — admin only). */
export async function getGameDetail(id: string) {
  const game = await prisma.game.findUnique({ where: { id } })
  if (!game) return null
  const [stakes, winners] = await Promise.all([
    getEndingStakes(id),
    prisma.bet.findMany({
      where: { gameId: id, result: 'WON' },
      include: { user: { select: { id: true, username: true } } },
      orderBy: [{ payout: 'desc' }, { id: 'asc' }],
    }),
  ])
  return { game, stakes, winners }
}
