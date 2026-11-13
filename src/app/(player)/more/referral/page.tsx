import { headers } from 'next/headers'

import { CopyShare } from '@/components/more/copy-share'
import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import { listMyReferrals } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { getBonus } from '@/server/settings'

export default async function ReferralPage() {
  const user = await requireUser()
  const [referrals, bonus, h] = await Promise.all([
    listMyReferrals(user.id),
    getBonus('referralBonus'),
    headers(),
  ])
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const link = `${origin}/signup?ref=${user.referralCode}`
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Refer friends</h1>
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Earn <PointsAmount value={bonus} unit className="text-primary font-semibold" /> for each friend
            who signs up with your code, once their first bet settles.
          </p>
          <div className="bg-surface-2 border-border rounded-lg border p-3 text-center">
            <div className="text-muted-foreground text-xs">Your code</div>
            <strong className="num text-primary text-2xl tracking-widest" data-testid="referral-code">
              {user.referralCode}
            </strong>
          </div>
          <CopyShare code={user.referralCode} link={link} />
          <p className="text-muted-foreground text-xs break-all">{link}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Players you referred ({referrals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody yet — share your link.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {referrals.map((r) => (
                <li key={r.username} className="flex justify-between py-2">
                  <span>{r.username}</span>
                  <span className="text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
