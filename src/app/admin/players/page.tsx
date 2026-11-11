import Link from 'next/link'
import { formatDateTime, formatPoints } from '@/lib/format'
import { isSuspended } from '@/lib/suspension'
import { searchPlayers } from '@/server/admin/queries'
import { requireAdmin } from '@/server/session'

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin()
  const { q } = await searchParams
  const players = await searchPlayers(q)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Players</h1>
      <form className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search username
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search username"
          className="input max-w-xs"
        />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Stake limit</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/players/${p.id}`} className="underline">
                    {p.username}
                  </Link>
                </td>
                <td className={p.balance < 0 ? 'text-red-600' : ''}>{formatPoints(p.balance)}</td>
                <td>{isSuspended(p) ? 'SUSPENDED' : 'ACTIVE'}</td>
                <td>{p.stakeLimitPerGame ?? '—'}</td>
                <td>{formatDateTime(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {players.length === 0 && <p className="p-2 text-sm text-gray-500">No players found.</p>}
      </div>
    </div>
  )
}
