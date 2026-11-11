import type { Bet, GameStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'
import { intFromForm } from '@/lib/validation'
import { postEntry } from './ledger'

export const placeBetSchema = z.object({
  gameId: z.string().min(1, 'Game is required'),
  awayDigit: intFromForm('Away digit', 0, 9),
  homeDigit: intFromForm('Home digit', 0, 9),
  stake: intFromForm('Stake', 1, 1_000_000_000),
})

export async function placeBet(userId: string, input: unknown, now: Date = new Date()): Promise<Bet> {
  const { gameId, awayDigit, homeDigit, stake } = placeBetSchema.parse(input)

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (isSuspended(user, now)) throw new DomainError('SUSPENDED', 'Account suspended')

    // Lock the game row: serializes bets on this game (stake-limit check is race-free)
    // and blocks status changes (sync/void) while the bet is written.
    const games = await tx.$queryRaw<{ id: string; status: GameStatus; startsAt: Date }[]>`
      SELECT id, status, "startsAt" FROM "Game" WHERE id = ${gameId} FOR UPDATE`
    const game = games[0]
    if (!game) throw new DomainError('NOT_FOUND', 'Game not found')
    if (game.status !== 'SCHEDULED' || now >= game.startsAt) {
      throw new DomainError('BETTING_CLOSED', 'Betting closed')
    }

    if (user.stakeLimitPerGame !== null) {
      const agg = await tx.bet.aggregate({ where: { userId, gameId }, _sum: { stake: true } })
      const already = agg._sum.stake ?? 0
      if (already + stake > user.stakeLimitPerGame) {
        const remaining = Math.max(0, user.stakeLimitPerGame - already)
        throw new DomainError('STAKE_LIMIT', `Stake limit exceeded (remaining: ${remaining})`)
      }
    }

    const bet = await tx.bet.upsert({
      where: { userId_gameId_awayDigit_homeDigit: { userId, gameId, awayDigit, homeDigit } },
      create: { userId, gameId, awayDigit, homeDigit, stake },
      update: { stake: { increment: stake } },
    })

    await postEntry(
      tx,
      { userId, type: 'BET', amount: -stake, gameId, betId: bet.id },
      { requireFunds: true },
    )
    await tx.game.update({ where: { id: gameId }, data: { pool: { increment: stake } } })
    return bet
  })
}
