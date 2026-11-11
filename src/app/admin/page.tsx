import Link from 'next/link'
import { formatDateTime, formatPoints } from '@/lib/format'
import { getDashboardStats } from '@/server/admin/queries'
import { requireAdmin } from '@/server/session'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

export default async function AdminDashboard() {
  await requireAdmin()
  const s = await getDashboardStats()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {s.syncStale && (
        <p role="alert" className="card border-red-300 bg-red-50 text-sm text-red-700">
          Game sync is stale. Last successful sync: {s.lastSyncAt ? formatDateTime(s.lastSyncAt) : 'never'}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Players" value={s.playerCount} />
        <Stat label={`Open pools (${s.openPoolCount})`} value={formatPoints(s.openPoolTotal)} />
        <Stat label="House take" value={formatPoints(s.houseTakeTotal)} />
        <Stat label="Open inquiries" value={s.openInquiries} />
      </div>
      {s.postponedCount > 0 && (
        <p className="card text-sm">
          {s.postponedCount} postponed game(s) need review.{' '}
          <Link href="/admin/games?status=POSTPONED" className="underline">
            Review
          </Link>
        </p>
      )}
      <div className="card">
        <h2 className="mb-2 font-semibold">Negative balances</h2>
        {s.negativeBalances.length === 0 ? (
          <p className="text-sm text-gray-500">None.</p>
        ) : (
          <ul className="text-sm">
            {s.negativeBalances.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/players/${u.id}`} className="underline">
                  {u.username}
                </Link>
                : {formatPoints(u.balance)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
