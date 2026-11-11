import Link from 'next/link'

import { Countdown } from '@/components/countdown'
import { formatPoints, formatTipoff } from '@/lib/format'
import { listUpcomingGames } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function GamesPage() {
  await requireUser()
  const games = await listUpcomingGames()
  const now = new Date()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Games</h1>
      {games.length === 0 && <p className="text-gray-500">No games scheduled right now.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {games.map((g) => {
          const open = g.status === 'SCHEDULED' && g.startsAt > now
          return (
            <li key={g.id}>
              <Link href={`/games/${g.id}`} className="card block hover:border-orange-400">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {g.awayTeam} @ {g.homeTeam}
                  </span>
                  <span className="text-xs text-gray-500">{g.status}</span>
                </div>
                <div className="mt-1 text-sm text-gray-600">{formatTipoff(g.startsAt)}</div>
                {g.awayScore !== null && g.homeScore !== null && (
                  <div className="mt-1 font-mono">
                    {g.awayScore} – {g.homeScore}
                  </div>
                )}
                <div className="mt-2 flex justify-between text-sm">
                  <span>Pool: {formatPoints(g.pool)}</span>
                  {open && <Countdown to={g.startsAt.toISOString()} />}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
