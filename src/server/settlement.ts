import type { GameStatus } from '@prisma/client'

import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { splitReturn } from '@/lib/funding'
import { endingOf } from '@/lib/game/ending'
import { computeSplit, REFUND_NOTES, refundReason } from '@/lib/game/payout'

import { logAdminAction } from './audit'
import { assertCan } from './authz'
import { lockUsers, postEntry } from './ledger'

type ReturnEntry = { type: 'PAYOUT' | 'REFUND'; gameId: string; adminId?: string; note?: string }

/** Credits `amount` for a bet: its points stake back to points, the rest to the wallet. */
async function postReturn(
  tx: Tx,
  bet: { id: string; userId: string; pointsStake: number },
  amount: number,
  entry: ReturnEntry,
) {
  const { points, wallet } = splitReturn(amount, bet.pointsStake)
  if (points > 0) {
    await postEntry(tx, { ...entry, userId: bet.userId, betId: bet.id, account: 'POINTS', amount: points })
  }
  if (wallet > 0) {
    await postEntry(tx, { ...entry, userId: bet.userId, betId: bet.id, account: 'WALLET', amount: wallet })
  }
}

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
        where: { gameId, result: 'PENDING' },
        orderBy: [{ userId: 'asc' }, { id: 'asc' }],
      })
      const entries = bets.map((b) => ({
        id: b.id,
        userId: b.userId,
        stake: b.stake,
        isWinner: b.awayDigit === ending.awayDigit && b.homeDigit === ending.homeDigit,
      }))
      const bettorIds = [...new Set(bets.map((b) => b.userId))]

      // A solo pool, a pool nobody won, or one with no losing stake is refunded in full.
      const reason = refundReason(entries)
      if (reason) {
        await lockUsers(tx, bettorIds)
        for (const bet of bets) {
          await postReturn(tx, bet, bet.stake, { type: 'REFUND', gameId, note: REFUND_NOTES[reason] })
          await tx.bet.update({ where: { id: bet.id }, data: { result: 'REFUNDED' } })
        }
        const pool = bets.reduce((sum, b) => sum + b.stake, 0)
        await tx.game.update({ where: { id: gameId }, data: { pool, houseTake: 0 } })
        return { settled: true }
      }

      await lockUsers(tx, bettorIds)

      const split = computeSplit(entries)

      for (const bet of bets) {
        const payout = split.payouts.get(bet.id)
        if (payout === undefined) {
          await tx.bet.update({ where: { id: bet.id }, data: { result: 'LOST' } })
          continue
        }
        await tx.bet.update({ where: { id: bet.id }, data: { result: 'WON', payout } })
        if (payout > 0) {
          await postReturn(tx, bet, payout, { type: 'PAYOUT', gameId })
        }
      }

      await tx.game.update({ where: { id: gameId }, data: { pool: split.pool, houseTake: split.houseTake } })
      return { settled: true }
    },
    { timeout: 30_000 },
  )
}

export async function voidGame(adminId: string, gameId: string, reason: unknown): Promise<void> {
  await assertCan(prisma, adminId, 'games.manage')
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
        where: { gameId, result: { not: 'REFUNDED' } },
        orderBy: [{ userId: 'asc' }, { id: 'asc' }],
      })
      for (const bet of bets) {
        if (bet.payout > 0) {
          // Reverse each payout row on the balance it went to.
          const paid = await tx.transaction.findMany({
            where: { betId: bet.id, type: 'PAYOUT' },
            select: { account: true, amount: true },
            orderBy: { id: 'asc' },
          })
          const sum = paid.reduce((n, p) => n + p.amount, 0)
          if (sum !== bet.payout) {
            throw new Error(`Bet ${bet.id} payout ${bet.payout} does not match its ledger rows (${sum})`)
          }
          for (const p of paid) {
            await postEntry(tx, {
              userId: bet.userId,
              account: p.account,
              type: 'REFUND',
              amount: -p.amount,
              gameId,
              betId: bet.id,
              adminId,
              note: 'Payout reversal',
            })
          }
        }
        await postReturn(tx, bet, bet.stake, {
          type: 'REFUND',
          gameId,
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
