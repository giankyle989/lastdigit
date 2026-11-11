import { formatDateTime, formatPoints } from '@/lib/format'
import { listMyTransactions } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function WalletPage() {
  const user = await requireUser()
  const txs = await listMyTransactions(user.id)
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-sm text-gray-600">Balance</div>
        <div className="text-3xl font-bold" data-testid="balance">
          {formatPoints(user.balance)} pts
        </div>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">History</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>{t.type}</td>
                <td className={t.amount < 0 ? 'text-red-600' : 'text-green-700'}>
                  {t.amount > 0 ? '+' : ''}
                  {formatPoints(t.amount)}
                </td>
                <td>{formatPoints(t.balanceAfter)}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 && <p className="p-2 text-sm text-gray-500">No transactions yet.</p>}
      </div>
    </div>
  )
}
