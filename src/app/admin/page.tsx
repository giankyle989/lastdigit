import Link from 'next/link'

import { KpiTile } from '@/components/admin/kpi-tile'
import { PageHeader } from '@/components/admin/page-header'
import { VolumeChart } from '@/components/admin/volume-chart'
import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatPoints, formatRelative } from '@/lib/format'
import { getDailyVolume, getOverviewStats, getTopBettorsToday } from '@/server/admin/overview'
import { requireAdmin } from '@/server/session'

export default async function AdminOverviewPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />
      <OverviewBody />
    </div>
  )
}

async function OverviewBody() {
  const now = new Date()
  const [s, daily, top] = await Promise.all([
    getOverviewStats(now),
    getDailyVolume(14, now),
    getTopBettorsToday(now),
  ])
  const allClear =
    s.postponed.length === 0 &&
    s.stuckSettlements.length === 0 &&
    s.negativeBalances.length === 0 &&
    s.openTickets.length === 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Players" value={formatPoints(s.playerCount)} sub={`+${s.newPlayers7d} in 7d`} />
        <KpiTile
          label="Open pools"
          value={formatPoints(s.openPoolTotal)}
          sub={`${s.openPoolCount} ${s.openPoolCount === 1 ? 'game' : 'games'}`}
        />
        <KpiTile
          label="House take (7d)"
          value={
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4">
                  {formatPoints(s.houseTake7d)}
                </span>
              </TooltipTrigger>
              <TooltipContent>All time: {formatPoints(s.houseTakeAllTime)}</TooltipContent>
            </Tooltip>
          }
          sub="Last 7 days (PHT)"
        />
        <KpiTile
          label="Sync"
          tone={s.syncStale ? 'danger' : undefined}
          value={s.lastSyncAt ? formatRelative(s.lastSyncAt, now) : 'never'}
          sub={s.lastSyncAt ? formatDateTime(s.lastSyncAt) : 'No successful sync yet'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumeChart data={daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            {allClear ? (
              <p className="text-primary text-sm">All clear</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {s.postponed.map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/games?game=${g.id}`} className="flex justify-between gap-2 py-2">
                      <span>
                        Postponed: {g.awayTeam} @ {g.homeTeam}
                      </span>
                      <span className="text-live">Review</span>
                    </Link>
                  </li>
                ))}
                {s.stuckSettlements.map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/games?game=${g.id}`} className="flex justify-between gap-2 py-2">
                      <span>
                        Settlement failing: {g.awayTeam} @ {g.homeTeam}
                      </span>
                      <span className="text-danger">Review</span>
                    </Link>
                  </li>
                ))}
                {s.negativeBalances.map((u) => (
                  <li key={u.id}>
                    <Link href={`/admin/players?player=${u.id}`} className="flex justify-between gap-2 py-2">
                      <span>Negative balance: {u.username}</span>
                      <PointsAmount value={u.balance} className="text-danger" />
                    </Link>
                  </li>
                ))}
                {s.openTickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/support?ticket=${t.id}`} className="flex justify-between gap-2 py-2">
                      <span>
                        Ticket: {t.subject} <span className="text-muted-foreground">· {t.username}</span>
                      </span>
                      <span className="text-live">Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top bettors today</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-muted-foreground text-sm">No bets yet today.</p>
            ) : (
              <ol className="divide-border divide-y text-sm">
                {top.map((b, i) => (
                  <li key={b.userId}>
                    <Link href={`/admin/players?player=${b.userId}`} className="flex items-center gap-3 py-2">
                      <span className="num text-muted-foreground w-4">{i + 1}</span>
                      <span className="flex-1">{b.username}</span>
                      <PointsAmount value={b.volume} unit />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
