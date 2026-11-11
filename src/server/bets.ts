import { type Bet, type GameStatus } from '@prisma/client'
import { z } from 'zod'

import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { formatEnding } from '@/lib/game/ending'
import { MAX_SLIP_PICKS, MAX_STAKE } from '@/lib/game/limits'
import { isSuspended } from '@/lib/suspension'
import { intFromForm } from '@/lib/validation'

import { postEntry } from './ledger'

export const placeBetSchema = z.object({
  gameId: z.string().min(1, 'Game is required'),
  awayDigit: intFromForm('Away digit', 0, 9),
  homeDigit: intFromForm('Home digit', 0, 9),
  stake: intFromForm('Stake', 1, MAX_STAKE),
})

export const placeBetsSchema = z
  .array(placeBetSchema)
  .min(1, 'Add at least one pick')
  .max(MAX_SLIP_PICKS, `A slip holds at most ${MAX_SLIP_PICKS} picks`)

type Pick = z.infer<typeof placeBetSchema>
type LockedGame = { id: string; status: GameStatus; startsAt: Date; awayTeam: string; homeTeam: string }

/** Locks each distinct game FOR UPDATE in ascending id order (deadlock-free across slips). */
async function lockGames(tx: Tx, gameIds: string[]): Promise<Map<string, LockedGame>> {
  const locked = new Map<string, LockedGame>()
  for (const id of [...new Set(gameIds)].sort()) {
    const rows = await tx.$queryRaw<LockedGame[]>`
      SELECT id, status, "startsAt", "awayTeam", "homeTeam" FROM "Game" WHERE id = ${id} FOR UPDATE`
    const game = rows[0]
    if (game) locked.set(id, game)
  }
  return locked
}

/**
 * Places every pick or none (spec §6.1). One transaction: games are locked in ascending id
 * order, then each pick is checked and written. A failing pick throws a DomainError carrying
 * `pickIndex`; with more than one pick its message is prefixed with the pick label
 * (`LAL @ GSW 9-6: Betting closed`).
 */
export async function placeBets(userId: string, input: unknown, now: Date = new Date()): Promise<Bet[]> {
  const picks = placeBetsSchema.parse(input)
  const single = picks.length === 1

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (isSuspended(user, now)) throw new DomainError('SUSPENDED', 'Account suspended')

    const games = await lockGames(
      tx,
      picks.map((p) => p.gameId),
    )
    const fail = (index: number, pick: Pick, e: DomainError): DomainError => {
      const game = games.get(pick.gameId)
      const label = game ? `${game.awayTeam} @ ${game.homeTeam} ${formatEnding(pick)}` : `Pick ${index + 1}`
      return new DomainError(e.code, single ? e.message : `${label}: ${e.message}`, index)
    }

    // Stake already on each game (before this slip), for the per-game limit.
    const existing = new Map<string, number>()
    if (user.stakeLimitPerGame !== null) {
      const sums = await tx.bet.groupBy({
        by: ['gameId'],
        where: { userId, gameId: { in: [...games.keys()] } },
        _sum: { stake: true },
      })
      for (const s of sums) existing.set(s.gameId, s._sum.stake ?? 0)
    }

    const bets: Bet[] = []
    for (const [index, pick] of picks.entries()) {
      const game = games.get(pick.gameId)
      if (!game) throw fail(index, pick, new DomainError('NOT_FOUND', 'Game not found'))
      if (game.status !== 'SCHEDULED' || now >= game.startsAt) {
        throw fail(index, pick, new DomainError('BETTING_CLOSED', 'Betting closed'))
      }

      if (user.stakeLimitPerGame !== null) {
        const already = existing.get(pick.gameId) ?? 0
        if (already + pick.stake > user.stakeLimitPerGame) {
          const remaining = Math.max(0, user.stakeLimitPerGame - already)
          throw fail(
            index,
            pick,
            new DomainError('STAKE_LIMIT', `Stake limit exceeded (remaining: ${remaining})`),
          )
        }
        existing.set(pick.gameId, already + pick.stake)
      }

      const { gameId, awayDigit, homeDigit, stake } = pick
      const bet = await tx.bet.upsert({
        where: { userId_gameId_awayDigit_homeDigit: { userId, gameId, awayDigit, homeDigit } },
        create: { userId, gameId, awayDigit, homeDigit, stake },
        update: { stake: { increment: stake } },
      })
      try {
        await postEntry(
          tx,
          { userId, type: 'BET', amount: -stake, gameId, betId: bet.id },
          { requireFunds: true },
        )
      } catch (e) {
        throw e instanceof DomainError ? fail(index, pick, e) : e
      }
      await tx.game.update({ where: { id: gameId }, data: { pool: { increment: stake } } })
      bets.push(bet)
    }
    return bets
  })
}

/** Single-pick wrapper kept for existing callers and tests. */
export async function placeBet(userId: string, input: unknown, now: Date = new Date()): Promise<Bet> {
  const [bet] = await placeBets(userId, [input], now)
  if (!bet) throw new Error('placeBets returned no bet for one pick')
  return bet
}
