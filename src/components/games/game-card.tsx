import type { GameStatus } from '@prisma/client'
import Link from 'next/link'

import { Countdown } from '@/components/countdown'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { TeamBadge } from '@/components/team-badge'
import { formatTipoffTime } from '@/lib/format'
import { displayStatus, isBettingOpen } from '@/lib/game/status'

export type GameCardData = {
  id: string
  awayTeam: string
  homeTeam: string
  startsAt: Date
  status: GameStatus
  awayScore: number | null
  homeScore: number | null
  pool: number
  myPickCount: number
}

const SHOWS_SCORE: GameStatus[] = ['LIVE', 'FINAL', 'SETTLED']

export function GameCard({ game, now }: { game: GameCardData; now: Date }) {
  const open = isBettingOpen(game, now)
  const showScore = SHOWS_SCORE.includes(game.status) && game.awayScore !== null && game.homeScore !== null
  return (
    <Link
      href={`/games/${game.id}`}
      className="bg-card border-border hover:border-primary/50 block rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={displayStatus(game, now)} />
        {game.myPickCount > 0 && (
          <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
            {game.myPickCount} {game.myPickCount === 1 ? 'pick' : 'picks'}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <TeamBadge abbr={game.awayTeam} />
        <span className="font-semibold">
          {game.awayTeam} <span className="text-muted-foreground">@</span> {game.homeTeam}
        </span>
        <TeamBadge abbr={game.homeTeam} />
        <span className="num ml-auto text-sm">
          {showScore ? `${game.awayScore}–${game.homeScore}` : formatTipoffTime(game.startsAt)}
        </span>
      </div>
      <div className="text-muted-foreground mt-3 flex items-center justify-between text-sm">
        <span>
          Pool <PointsAmount value={game.pool} className="text-foreground" />
        </span>
        {open && <Countdown to={game.startsAt.toISOString()} />}
      </div>
    </Link>
  )
}
