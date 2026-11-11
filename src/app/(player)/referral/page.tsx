import { headers } from 'next/headers'
import { formatDateTime, formatPoints } from '@/lib/format'
import { listMyReferrals } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { getReferralBonus } from '@/server/settings'

export default async function ReferralPage() {
  const user = await requireUser()
  const [referrals, bonus, h] = await Promise.all([listMyReferrals(user.id), getReferralBonus(), headers()])
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const link = `${origin}/signup?ref=${user.referralCode}`
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h1 className="text-xl font-semibold">Refer friends</h1>
        <p className="text-sm">Earn {formatPoints(bonus)} points for each friend who signs up with your code.</p>
        <p>Your code: <strong className="font-mono" data-testid="referral-code">{user.referralCode}</strong></p>
        <p className="break-all text-sm">Share link: <span className="font-mono">{link}</span></p>
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold">Referred players ({referrals.length})</h2>
        <ul className="text-sm">
          {referrals.map((r) => (
            <li key={r.username}>{r.username} · {formatDateTime(r.createdAt)}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
