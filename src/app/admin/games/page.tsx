import { GameStatus } from '@prisma/client'
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { formatPoints, formatTipoff } from '@/lib/format'
import { listGamesAdmin } from '@/server/admin/queries'
import { forceSyncAction, voidGameAction } from '../actions'
import { requireAdmin } from '@/server/session'

const STATUSES = Object.values(GameStatus)

export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireAdmin()
  const { status } = await searchParams
  const filter = STATUSES.includes(status as GameStatus) ? (status as GameStatus) : undefined
  const games = await listGamesAdmin(filter)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Games</h1>
        <ActionForm action={forceSyncAction} submitLabel="Force sync" className="flex items-center gap-2" />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/games" className={!filter ? 'btn' : 'btn-secondary'}>
          ALL
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/games?status=${s}`} className={filter === s ? 'btn' : 'btn-secondary'}>
            {s}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Tip-off</th>
              <th>Status</th>
              <th>Score</th>
              <th>Pool</th>
              <th>House</th>
              <th>Winners</th>
              <th>Void</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id} className={g.status === 'POSTPONED' ? 'bg-yellow-50' : ''}>
                <td>
                  {g.awayTeam} @ {g.homeTeam}
                </td>
                <td>{formatTipoff(g.startsAt)}</td>
                <td>{g.status}</td>
                <td className="font-mono">
                  {g.awayScore ?? '–'}-{g.homeScore ?? '–'}
                </td>
                <td>{formatPoints(g.pool)}</td>
                <td>{formatPoints(g.houseTake)}</td>
                <td>{g._count.bets}</td>
                <td>
                  {g.status === 'VOID' ? (
                    <span className="text-xs text-gray-500">{g.voidReason}</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-xs text-red-600">Void…</summary>
                      <ActionForm
                        action={voidGameAction.bind(null, g.id)}
                        submitLabel="Void game"
                        className="mt-2 space-y-2"
                      >
                        <label htmlFor={`reason-${g.id}`} className="label">
                          Reason
                        </label>
                        <input id={`reason-${g.id}`} name="reason" className="input" required />
                      </ActionForm>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {games.length === 0 && <p className="p-2 text-sm text-gray-500">No games.</p>}
      </div>
    </div>
  )
}
