import { notFound } from 'next/navigation'
import { BetGrid } from '@/components/bet-grid'
import { Countdown } from '@/components/countdown'
import { endingOf, formatEnding } from '@/lib/game/ending'
import { formatPoints, formatTipoff } from '@/lib/format'
import { getGameForPlayer } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { placeBetAction } from '../../actions'

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const data = await getGameForPlayer(id, user.id)
  if (!data) notFound()
  const { game, myBets, winners } = data

  const open = game.status === 'SCHEDULED' && game.startsAt > new Date()
  const hasFinal =
    (game.status === 'FINAL' || game.status === 'SETTLED') &&
    game.awayScore !== null &&
    game.homeScore !== null
  const winning = hasFinal ? formatEnding(endingOf(game.awayScore!, game.homeScore!)) : undefined
  const myStakes = Object.fromEntries(myBets.map((b) => [`${b.awayDigit}-${b.homeDigit}`, b.stake]))

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">
          {game.awayTeam} @ {game.homeTeam}
        </h1>
        <p className="text-sm text-gray-600">
          {formatTipoff(game.startsAt)} · {game.status} · Pool {formatPoints(game.pool)}
        </p>
        {game.awayScore !== null && game.homeScore !== null && (
          <p className="mt-2 font-mono text-2xl">
            {game.awayScore} – {game.homeScore}
          </p>
        )}
        {winning && (
          <p className="mt-1 text-sm">
            Winning ending: <strong className="font-mono">{winning}</strong>
            {game.status === 'SETTLED' && ` · ${winners} winning bet${winners === 1 ? '' : 's'}`}
          </p>
        )}
        {game.status === 'VOID' && (
          <p className="mt-1 text-sm text-red-600">Void: {game.voidReason}. Stakes were refunded.</p>
        )}
        {open && (
          <p className="mt-1 text-sm text-orange-700">
            <Countdown to={game.startsAt.toISOString()} />
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">{open ? 'Place bet' : 'Endings'}</h2>
        <BetGrid
          action={placeBetAction.bind(null, game.id)}
          open={open}
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          myStakes={myStakes}
          winning={winning}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">My bets on this game</h2>
        {myBets.length === 0 ? (
          <p className="text-sm text-gray-500">No bets yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Ending</th>
                <th>Stake</th>
                <th>Result</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {myBets.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono">
                    {b.awayDigit}-{b.homeDigit}
                  </td>
                  <td>{formatPoints(b.stake)}</td>
                  <td>{b.result}</td>
                  <td>{formatPoints(b.payout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
