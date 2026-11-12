import type { GameStatus } from '@prisma/client'

export type DisplayStatus = 'OPEN' | 'CLOSED' | 'LIVE' | 'FINAL' | 'SETTLED' | 'VOID' | 'POSTPONED'

type GameTiming = { status: GameStatus; startsAt: Date }

export function isBettingOpen(game: GameTiming, now: Date): boolean {
  return game.status === 'SCHEDULED' && now < game.startsAt
}

/** SCHEDULED shows as OPEN before tip-off and CLOSED after it (spec §3.4). */
export function displayStatus(game: GameTiming, now: Date): DisplayStatus {
  switch (game.status) {
    case 'SCHEDULED':
      return isBettingOpen(game, now) ? 'OPEN' : 'CLOSED'
    case 'LIVE':
    case 'FINAL':
    case 'SETTLED':
    case 'VOID':
    case 'POSTPONED':
      return game.status
  }
}
