import type { GameStatus } from '@prisma/client'

import { Countdown } from '@/components/countdown'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { TeamBadge } from '@/components/team-badge'
import { formatTipoff } from '@/lib/format'
import { formatEnding, winningEnding } from '@/lib/game/ending'
import { displayStatus, isBettingOpen } from '@/lib/game/status'

export type GameHeaderData = {
  awayTeam: string
  homeTeam: string
  startsAt: Date
  status: GameStatus
  awayScore: number | null
  homeScore: number | null
  pool: number
  voidReason: string | null
}

export function GameHeader({ game, winners, now }: { game: GameHeaderData; winners: number; now: Date }) {
  const showScore =
    (game.status === 'LIVE' || game.status === 'FINAL' || game.status === 'SETTLED') &&
    game.awayScore !== null &&
    game.homeScore !== null
  const winning = winningEnding(game)
  return (
    <header className="bg-card border-border rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={displayStatus(game, now)} />
        <span className="text-muted-foreground text-xs">{formatTipoff(game.startsAt)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <TeamBadge abbr={game.awayTeam} size="lg" />
          <span className="text-muted-foreground text-xs">Away</span>
        </div>
        <h1 className="num text-center text-2xl font-bold">
          {showScore ? (
            `${game.awayScore} – ${game.homeScore}`
          ) : (
            <>
              {game.awayTeam} <span className="text-muted-foreground">@</span> {game.homeTeam}
            </>
          )}
        </h1>
        <div className="flex flex-col items-center gap-1">
          <TeamBadge abbr={game.homeTeam} size="lg" />
          <span className="text-muted-foreground text-xs">Home</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Pool <PointsAmount value={game.pool} unit className="text-foreground" />
        </span>
        {isBettingOpen(game, now) && (
          <span className="text-muted-foreground">
            Closes in <Countdown to={game.startsAt.toISOString()} />
          </span>
        )}
      </div>
      {winning && (
        <p className="mt-2 text-sm">
          Winning ending <strong className="num text-primary">{formatEnding(winning)}</strong>
          {game.status === 'SETTLED' && ` · ${winners} winning ${winners === 1 ? 'bet' : 'bets'}`}
        </p>
      )}
      {game.status === 'VOID' && (
        <p className="text-danger mt-2 text-sm">Void: {game.voidReason}. Stakes were refunded.</p>
      )}
    </header>
  )
}
