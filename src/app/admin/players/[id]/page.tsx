import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { formatDateTime, formatPoints } from '@/lib/format'
import { isSuspended } from '@/lib/suspension'
import { getPlayerDetail } from '@/server/admin/queries'
import {
  adjustPointsAction,
  resetPasswordAction,
  stakeLimitAction,
  suspendAction,
  unsuspendAction,
} from '../../actions'
import { requireAdmin } from '@/server/session'

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const p = await getPlayerDetail(id)
  if (!p) notFound()
  const suspended = isSuspended(p)

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">{p.username}</h1>
        <p className="text-sm text-gray-600">
          Balance <strong className={p.balance < 0 ? 'text-red-600' : ''}>{formatPoints(p.balance)}</strong> · Joined{' '}
          {formatDateTime(p.createdAt)} · Code <span className="font-mono">{p.referralCode}</span>
        </p>
        <p className="text-sm">
          Referred by:{' '}
          {p.referredBy ? <Link href={`/admin/players/${p.referredBy.id}`} className="underline">{p.referredBy.username}</Link> : '—'}
        </p>
        <p className="text-sm">
          Status: {suspended ? `SUSPENDED${p.suspendedUntil ? ` until ${formatDateTime(p.suspendedUntil)}` : ' (indefinite)'}` : 'ACTIVE'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">Points</h2>
          <ActionForm action={adjustPointsAction.bind(null, p.id)} submitLabel="Apply points" resetOnSuccess>
            <div>
              <label htmlFor="direction" className="label">Direction</label>
              <select id="direction" name="direction" className="input">
                <option value="GRANT">Grant</option>
                <option value="DEDUCT">Deduct</option>
              </select>
            </div>
            <div>
              <label htmlFor="amount" className="label">Amount</label>
              <input id="amount" name="amount" type="number" min={1} step={1} className="input" required />
            </div>
            <div>
              <label htmlFor="note" className="label">Note</label>
              <input id="note" name="note" className="input" maxLength={500} required />
            </div>
          </ActionForm>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">Restrictions</h2>
          {suspended ? (
            <ActionForm action={unsuspendAction.bind(null, p.id)} submitLabel="Lift suspension" />
          ) : (
            <ActionForm action={suspendAction.bind(null, p.id)} submitLabel="Suspend">
              <label htmlFor="until" className="label">Suspend until (UTC date, blank = indefinite)</label>
              <input id="until" name="until" type="date" className="input" />
            </ActionForm>
          )}
          <ActionForm action={stakeLimitAction.bind(null, p.id)} submitLabel="Save stake limit">
            <label htmlFor="limit" className="label">Stake limit per game (blank = none)</label>
            <input id="limit" name="limit" type="number" min={1} step={1} className="input" defaultValue={p.stakeLimitPerGame ?? ''} />
          </ActionForm>
          <ActionForm action={resetPasswordAction.bind(null, p.id)} submitLabel="Reset password" resetOnSuccess>
            <label htmlFor="newPassword" className="label">New password</label>
            <input id="newPassword" name="newPassword" type="text" minLength={8} className="input" required />
          </ActionForm>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Referred players ({p.referrals.length})</h2>
        <ul className="text-sm">
          {p.referrals.map((r) => (
            <li key={r.id}><Link href={`/admin/players/${r.id}`} className="underline">{r.username}</Link> · {formatDateTime(r.createdAt)}</li>
          ))}
        </ul>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Recent bets</h2>
        <table className="table">
          <thead><tr><th>Game</th><th>Ending</th><th>Stake</th><th>Result</th><th>Payout</th></tr></thead>
          <tbody>
            {p.bets.map((b) => (
              <tr key={b.id}>
                <td>{b.game.awayTeam} @ {b.game.homeTeam}</td>
                <td className="font-mono">{b.awayDigit}-{b.homeDigit}</td>
                <td>{formatPoints(b.stake)}</td>
                <td>{b.result}</td>
                <td>{formatPoints(b.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Recent transactions</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th></tr></thead>
          <tbody>
            {p.transactions.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>{t.type}</td>
                <td>{formatPoints(t.amount)}</td>
                <td>{formatPoints(t.balanceAfter)}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
