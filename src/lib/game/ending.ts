import type { GameStatus } from '@prisma/client'

export type Ending = { awayDigit: number; homeDigit: number }

export function endingOf(awayScore: number, homeScore: number): Ending {
  for (const s of [awayScore, homeScore]) {
    if (!Number.isInteger(s) || s < 0) throw new Error(`Invalid score: ${s}`)
  }
  return { awayDigit: awayScore % 10, homeDigit: homeScore % 10 }
}

export function formatEnding(e: Ending): string {
  return `${e.awayDigit}-${e.homeDigit}`
}

/** The winning ending once a game is FINAL or SETTLED with scores, else null. */
export function winningEnding(game: {
  status: GameStatus
  awayScore: number | null
  homeScore: number | null
}): Ending | null {
  const done = game.status === 'FINAL' || game.status === 'SETTLED'
  return done && game.awayScore !== null && game.homeScore !== null
    ? endingOf(game.awayScore, game.homeScore)
    : null
}
