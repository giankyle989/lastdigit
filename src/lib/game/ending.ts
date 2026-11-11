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
