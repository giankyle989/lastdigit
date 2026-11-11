import { ActionForm } from '@/components/action-form'
import { formatDateTime } from '@/lib/format'
import { listAdminActions } from '@/server/admin/queries'
import { getReferralBonus } from '@/server/settings'
import { referralBonusAction } from '../actions'

export default async function AdminSettingsPage() {
  const [bonus, actions] = await Promise.all([getReferralBonus(), listAdminActions()])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="card max-w-sm">
        <ActionForm action={referralBonusAction} submitLabel="Save">
          <label htmlFor="referralBonus" className="label">Referral bonus (points to referrer)</label>
          <input id="referralBonus" name="referralBonus" type="number" min={0} step={1} defaultValue={bonus} className="input" required />
        </ActionForm>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Admin action log</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Player</th><th>Details</th></tr></thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td>{formatDateTime(a.createdAt)}</td>
                <td>{a.admin.username}</td>
                <td>{a.action}</td>
                <td>{a.targetUser?.username ?? '—'}</td>
                <td className="font-mono text-xs">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
