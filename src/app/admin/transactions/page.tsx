import { TransactionType } from '@prisma/client'
import { formatDateTime, formatPoints } from '@/lib/format'
import { listTransactionsAdmin } from '@/server/admin/queries'
import { requireAdmin } from '@/server/session'

const TYPES = Object.values(TransactionType)

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string; type?: string; from?: string; to?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const type = TYPES.includes(sp.type as TransactionType) ? (sp.type as TransactionType) : undefined
  const to = parseDate(sp.to)
  const txs = await listTransactionsAdmin({
    username: sp.username,
    type,
    from: parseDate(sp.from),
    to: to ? new Date(to.getTime() + 86_400_000) : undefined, // inclusive end date
  })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>
      <form className="card grid gap-2 sm:grid-cols-5">
        <div>
          <label htmlFor="username" className="label">Username</label>
          <input id="username" name="username" defaultValue={sp.username ?? ''} className="input" />
        </div>
        <div>
          <label htmlFor="type" className="label">Type</label>
          <select id="type" name="type" defaultValue={type ?? ''} className="input">
            <option value="">All</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="label">From</label>
          <input id="from" name="from" type="date" defaultValue={sp.from ?? ''} className="input" />
        </div>
        <div>
          <label htmlFor="to" className="label">To</label>
          <input id="to" name="to" type="date" defaultValue={sp.to ?? ''} className="input" />
        </div>
        <div className="flex items-end"><button className="btn">Filter</button></div>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>User</th><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th></tr></thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>{t.user.username}</td>
                <td>{t.type}</td>
                <td>{formatPoints(t.amount)}</td>
                <td>{formatPoints(t.balanceAfter)}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 && <p className="p-2 text-sm text-gray-500">No transactions.</p>}
      </div>
    </div>
  )
}
