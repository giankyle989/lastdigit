import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { ActionDialog } from '@/components/admin/action-dialog'
import { Field } from '@/components/admin/field'
import { BetResult } from '@/components/bet-result'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatEnding } from '@/lib/game/ending'
import { isSuspended } from '@/lib/suspension'
import { TX_TYPE_LABELS } from '@/lib/wallet'
import type { getPlayerDetail } from '@/server/admin/queries'

import {
  adjustPointsAction,
  resetPasswordAction,
  stakeLimitAction,
  suspendAction,
  unsuspendAction,
} from '../actions'

type Player = NonNullable<Awaited<ReturnType<typeof getPlayerDetail>>>

export function PlayerDrawer({ player: p }: { player: Player }) {
  const suspended = isSuspended(p)
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Balance</dt>
          <dd>
            <PointsAmount value={p.balance} unit className={p.balance < 0 ? 'text-danger' : ''} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Status</dt>
          <dd className={suspended ? 'text-danger' : 'text-primary'}>
            {suspended
              ? `Suspended${p.suspendedUntil ? ` until ${formatDate(p.suspendedUntil)}` : ' (indefinite)'}`
              : 'Active'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Referred by</dt>
          <dd>
            {p.referredBy ? (
              <Link
                href={`/admin/players?player=${p.referredBy.id}`}
                className="text-primary hover:underline"
              >
                {p.referredBy.username}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Joined</dt>
          <dd>{formatDateTime(p.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Stake limit / game</dt>
          <dd className="num">{p.stakeLimitPerGame ?? 'None'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Referral code</dt>
          <dd className="num">{p.referralCode}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <ActionDialog
          triggerLabel="Grant"
          title={`Grant points to ${p.username}`}
          submitLabel="Grant points"
          action={adjustPointsAction.bind(null, p.id)}
        >
          <input type="hidden" name="direction" value="GRANT" />
          <Field id="amount" label="Amount">
            <Input id="amount" name="amount" type="number" min={1} step={1} required />
          </Field>
          <Field id="note" label="Note">
            <Input id="note" name="note" maxLength={500} required />
          </Field>
        </ActionDialog>
        <ActionDialog
          triggerLabel="Deduct"
          title={`Deduct points from ${p.username}`}
          submitLabel="Deduct points"
          action={adjustPointsAction.bind(null, p.id)}
        >
          <input type="hidden" name="direction" value="DEDUCT" />
          <Field id="amount" label="Amount">
            <Input id="amount" name="amount" type="number" min={1} step={1} required />
          </Field>
          <Field id="note" label="Note">
            <Input id="note" name="note" maxLength={500} required />
          </Field>
        </ActionDialog>
        {/* Both stay mounted (hidden, not swapped) so the success toast and onSuccess of the form
            that just submitted are not lost when the revalidated render flips `suspended`. */}
        <div className={suspended ? 'contents' : 'hidden'}>
          <ActionForm
            action={unsuspendAction.bind(null, p.id)}
            submitLabel="Unsuspend"
            className="contents"
          />
        </div>
        <div className={suspended ? 'hidden' : 'contents'}>
          <ActionDialog
            triggerLabel="Suspend"
            title={`Suspend ${p.username}`}
            description="Leave the date empty to suspend until lifted."
            submitLabel="Suspend"
            destructive
            action={suspendAction.bind(null, p.id)}
            confirm={{
              title: `Suspend ${p.username}?`,
              description: 'They are logged out and cannot bet until the suspension ends.',
              actionLabel: 'Suspend',
            }}
          >
            <Field id="until" label="Suspend until (optional, PHT date)">
              <Input id="until" name="until" type="date" />
            </Field>
          </ActionDialog>
        </div>
        <ActionDialog
          triggerLabel="Stake limit"
          title="Stake limit per game"
          description="Leave empty to remove the limit."
          submitLabel="Save stake limit"
          action={stakeLimitAction.bind(null, p.id)}
        >
          <Field id="limit" label="Limit (points per game)">
            <Input
              id="limit"
              name="limit"
              type="number"
              min={1}
              step={1}
              defaultValue={p.stakeLimitPerGame ?? ''}
            />
          </Field>
        </ActionDialog>
        <ActionDialog
          triggerLabel="Reset password"
          title={`Reset password for ${p.username}`}
          submitLabel="Reset password"
          action={resetPasswordAction.bind(null, p.id)}
        >
          <Field id="newPassword" label="New password" hint="At least 8 characters">
            <Input id="newPassword" name="newPassword" type="text" minLength={8} required />
          </Field>
        </ActionDialog>
      </div>

      <Tabs defaultValue="bets">
        <TabsList>
          <TabsTrigger value="bets">Bets</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="referrals">Referrals ({p.referrals.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="bets">
          <ul className="divide-border divide-y text-sm">
            {p.bets.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2">
                <Link href={`/admin/games?game=${b.gameId}`} className="hover:underline">
                  {b.game.awayTeam} @ {b.game.homeTeam}
                </Link>
                <span className="num">{formatEnding(b)}</span>
                <PointsAmount value={b.stake} />
                <BetResult result={b.result} payout={b.payout} />
              </li>
            ))}
            {p.bets.length === 0 && <li className="text-muted-foreground py-2">No bets.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="ledger">
          <ul className="divide-border divide-y text-sm">
            {p.transactions.map((t) => (
              <li key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2">
                <span>
                  {TX_TYPE_LABELS[t.type]}
                  <span className="text-muted-foreground block text-xs">
                    {formatDateTime(t.createdAt)}
                    {t.note ? ` · ${t.note}` : ''}
                  </span>
                </span>
                <PointsAmount value={t.amount} signed />
                <PointsAmount value={t.balanceAfter} className="text-muted-foreground" />
              </li>
            ))}
            {p.transactions.length === 0 && <li className="text-muted-foreground py-2">No transactions.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="referrals">
          <ul className="divide-border divide-y text-sm">
            {p.referrals.map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <Link href={`/admin/players?player=${r.id}`} className="hover:underline">
                  {r.username}
                </Link>
                <span className="text-muted-foreground">{formatDateTime(r.createdAt)}</span>
              </li>
            ))}
            {p.referrals.length === 0 && <li className="text-muted-foreground py-2">No referrals.</li>}
          </ul>
        </TabsContent>
      </Tabs>
    </>
  )
}
