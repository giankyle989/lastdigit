import type { BetResult } from '@prisma/client'
import Link from 'next/link'
import { formatPoints, formatTipoff } from '@/lib/format'
import { listMyBets } from '@/server/queries/player'
import { requireUser } from '@/server/session'

const FILTERS: (BetResult | 'ALL')[] = ['ALL', 'PENDING', 'WON', 'LOST', 'REFUNDED']

export default async function BetsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const user = await requireUser()
  const { result } = await searchParams
  const filter = FILTERS.includes(result as BetResult) && result !== 'ALL' ? (result as BetResult) : undefined
  const bets = await listMyBets(user.id, filter)
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">My bets</h1>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'ALL' ? '/bets' : `/bets?result=${f}`}
            className={(filter ?? 'ALL') === f ? 'btn' : 'btn-secondary'}
          >
            {f}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Tip-off</th>
              <th>Ending</th>
              <th>Stake</th>
              <th>Result</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/games/${b.gameId}`} className="underline">
                    {b.game.awayTeam} @ {b.game.homeTeam}
                  </Link>
                </td>
                <td>{formatTipoff(b.game.startsAt)}</td>
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
        {bets.length === 0 && <p className="p-2 text-sm text-gray-500">No bets.</p>}
      </div>
    </div>
  )
}
