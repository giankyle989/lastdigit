import type { GameStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { endingOf } from '@/lib/game/ending'
import { computeSplit } from '@/lib/game/payout'
import { logAdminAction } from './audit'
import { postEntry } from './ledger'

export async function settleGame(gameId: string, now: Date = new Date()): Promise<{ settled: boolean }> {
  return prisma.$transaction(
    async (tx) => {
      // Claim the game atomically; concurrent or repeated runs get count 0.
      const claimed = await tx.game.updateMany({
        where: { id: gameId, status: 'FINAL' },
        data: { status: 'SETTLED', settledAt: now },
      })
      if (claimed.count === 0) return { settled: false }

      const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } })
      if (game.awayScore === null || game.homeScore === null) {
        throw new Error(`Game ${gameId} is FINAL without scores`) // rolls back the claim
      }
      const ending = endingOf(game.awayScore, game.homeScore)
      // Stable order: per-user postEntry locks are taken in a consistent sequence,
      // so concurrent settle/void runs on games sharing users cannot deadlock.
      const bets = await tx.bet.findMany({
        where: { gameId },
        orderBy: [{ userId: 'asc' }, { id: 'asc' }],
      })
      const split = computeSplit(
        bets.map((b) => ({
          id: b.id,
          stake: b.stake,
          isWinner: b.awayDigit === ending.awayDigit && b.homeDigit === ending.homeDigit,
        })),
      )

      for (const bet of bets) {
        const payout = split.payouts.get(bet.id)
        if (payout === undefined) {
          await tx.bet.update({ where: { id: bet.id }, data: { result: 'LOST' } })
          continue
        }
        await tx.bet.update({ where: { id: bet.id }, data: { result: 'WON', payout } })
        if (payout > 0) {
          await postEntry(tx, { userId: bet.userId, type: 'PAYOUT', amount: payout, gameId, betId: bet.id })
        }
      }

      await tx.game.update({ where: { id: gameId }, data: { pool: split.pool, houseTake: split.houseTake } })
      return { settled: true }
    },
    { timeout: 30_000 },
  )
}

export async function voidGame(adminId: string, gameId: string, reason: unknown): Promise<void> {
  const why = typeof reason === 'string' ? reason.trim() : ''
  if (!why) throw new DomainError('VALIDATION', 'A reason is required')

  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; status: GameStatus }[]>`
        SELECT id, status FROM "Game" WHERE id = ${gameId} FOR UPDATE`
      const game = rows[0]
      if (!game) throw new DomainError('NOT_FOUND', 'Game not found')
      if (game.status === 'VOID') throw new DomainError('CONFLICT', 'Game is already void')

      // Stable order: per-user postEntry locks are taken in a consistent sequence,
      // so concurrent settle/void runs on games sharing users cannot deadlock.
      const bets = await tx.bet.findMany({
        where: { gameId },
        orderBy: [{ userId: 'asc' }, { id: 'asc' }],
      })
      for (const bet of bets) {
        if (bet.payout > 0) {
          await postEntry(tx, {
            userId: bet.userId,
            type: 'REFUND',
            amount: -bet.payout,
            gameId,
            betId: bet.id,
            adminId,
            note: 'Payout reversal',
          })
        }
        await postEntry(tx, {
          userId: bet.userId,
          type: 'REFUND',
          amount: bet.stake,
          gameId,
          betId: bet.id,
          adminId,
          note: `Game voided: ${why}`,
        })
        await tx.bet.update({ where: { id: bet.id }, data: { result: 'REFUNDED', payout: 0 } })
      }

      await tx.game.update({ where: { id: gameId }, data: { status: 'VOID', voidReason: why, houseTake: 0 } })
      await logAdminAction(tx, {
        adminId,
        action: 'VOID_GAME',
        targetGameId: gameId,
        details: { reason: why, previousStatus: game.status },
      })
    },
    { timeout: 30_000 },
  )
}
