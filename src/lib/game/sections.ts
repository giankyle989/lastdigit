import type { GameStatus } from '@prisma/client'

import { isBettingOpen } from './status'

export type SectionKey = 'live' | 'open' | 'closed' | 'final'

export const SECTION_TITLES: Record<SectionKey, string> = {
  live: 'Live',
  open: 'Open for bets',
  closed: 'Upcoming / closed',
  final: 'Final',
}

const ORDER: SectionKey[] = ['live', 'open', 'closed', 'final']

export function sectionOf(game: { status: GameStatus; startsAt: Date }, now: Date): SectionKey {
  switch (game.status) {
    case 'LIVE':
      return 'live'
    case 'SCHEDULED':
      return isBettingOpen(game, now) ? 'open' : 'closed'
    case 'POSTPONED':
      return 'closed'
    case 'FINAL':
    case 'SETTLED':
    case 'VOID':
      return 'final'
  }
}

/** Games grouped into the feed's sections, in feed order; empty sections are dropped (spec §4.1). */
export function groupIntoSections<G extends { status: GameStatus; startsAt: Date }>(
  games: G[],
  now: Date,
): { key: SectionKey; title: string; games: G[] }[] {
  return ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    games: games.filter((g) => sectionOf(g, now) === key),
  })).filter((s) => s.games.length > 0)
}
