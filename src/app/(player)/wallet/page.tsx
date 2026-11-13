import { ActionForm } from '@/components/action-form'
import { EmptyState } from '@/components/empty-state'
import { FilterChips } from '@/components/filter-chips'
import { Pagination } from '@/components/pagination'
import { PointsAmount } from '@/components/points-amount'
import { TxIcon } from '@/components/tx-icon'
import { localDateOf } from '@/lib/dates'
import { formatDay, formatTipoffTime } from '@/lib/format'
import { parsePage } from '@/lib/pagination'
import type { SearchParams } from '@/lib/table-params'
import {
  parseWalletFilter,
  TX_TYPE_LABELS,
  WALLET_FILTER_LABELS,
  WALLET_FILTERS,
  type WalletFilter,
} from '@/lib/wallet'
import { canClaimDailyBonus } from '@/server/bonuses'
import { listMyTransactions } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { getBonus } from '@/server/settings'

import { claimDailyBonusAction } from '../actions'

export default async function WalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  const sp = await searchParams
  const filter = parseWalletFilter(sp.type)
  const page = parsePage(sp.page)
  const daily = await getBonus('dailyBonus')
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Wallet</h1>
      <section className="from-primary/20 to-card border-border rounded-xl border bg-gradient-to-br p-5">
        <div className="text-muted-foreground text-sm">Balance</div>
        <div className="mt-1 text-4xl font-bold" data-testid="balance">
          <PointsAmount value={user.balance} unit />
        </div>
      </section>
      {daily > 0 && (
        <section className="bg-card border-border flex items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <div className="text-sm font-medium">Daily bonus</div>
            <div className="text-muted-foreground text-xs">
              {canClaimDailyBonus(user)
                ? `Claim ${daily.toLocaleString('en-US')} free points once a day.`
                : 'Claimed today — come back tomorrow (resets at midnight PHT).'}
            </div>
          </div>
          {/* Kept mounted after a claim (only hidden) so its success toast still fires. */}
          <div hidden={!canClaimDailyBonus(user)}>
            <ActionForm action={claimDailyBonusAction} submitLabel="Claim" />
          </div>
        </section>
      )}
      <FilterChips
        label="Transaction type"
        chips={WALLET_FILTERS.map((f) => ({
          label: WALLET_FILTER_LABELS[f],
          href: f === 'all' ? '/wallet' : `/wallet?type=${f}`,
          active: f === filter,
        }))}
      />
      <TransactionDays userId={user.id} filter={filter} page={page} />
    </div>
  )
}

async function TransactionDays({
  userId,
  filter,
  page,
}: {
  userId: string
  filter: WalletFilter
  page: number
}) {
  const result = await listMyTransactions(userId, filter, page)
  if (result.rows.length === 0) return <EmptyState>No transactions yet.</EmptyState>

  // Rows come newest first; group them by PHT calendar day.
  const days: { date: string; rows: typeof result.rows }[] = []
  for (const t of result.rows) {
    const date = localDateOf(t.createdAt)
    const last = days.at(-1)
    if (last?.date === date) last.rows.push(t)
    else days.push({ date, rows: [t] })
  }

  return (
    <>
      {days.map((day) => (
        <section key={day.date} aria-label={formatDay(day.date)}>
          <h2 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
            {formatDay(day.date)}
          </h2>
          <ul className="bg-card border-border divide-border divide-y rounded-xl border">
            {day.rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-3">
                <TxIcon type={t.type} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{TX_TYPE_LABELS[t.type]}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {t.game ? `${t.game.awayTeam} @ ${t.game.homeTeam}` : (t.note ?? '')} ·{' '}
                    {formatTipoffTime(t.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <PointsAmount value={t.amount} signed className="block font-semibold" />
                  <span className="text-muted-foreground text-xs">
                    <PointsAmount value={t.balanceAfter} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Pagination
        basePath="/wallet"
        params={filter === 'all' ? {} : { type: filter }}
        page={result.page}
        pageCount={result.pageCount}
      />
    </>
  )
}
