import Link from 'next/link'

import { SplitAmount } from '@/components/amount'
import { BetResult } from '@/components/bet-result'
import { EmptyState } from '@/components/empty-state'
import { FilterChips } from '@/components/filter-chips'
import { Pagination } from '@/components/pagination'
import { StatusPill } from '@/components/status-pill'
import { TeamBadge } from '@/components/team-badge'
import { formatTipoff } from '@/lib/format'
import { formatEnding } from '@/lib/game/ending'
import { displayStatus } from '@/lib/game/status'
import { BET_TAB_LABELS, BET_TABS, type BetTab, parseBetTab } from '@/lib/my-bets'
import { parsePage } from '@/lib/pagination'
import type { SearchParams } from '@/lib/table-params'
import { listMyBetsGrouped } from '@/server/queries/player'
import { requirePlayer } from '@/server/session'

const EMPTY: Record<BetTab, string> = {
  open: 'No open bets.',
  settled: 'No settled bets yet.',
  refunded: 'No refunded bets.',
}

export default async function MyBetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePlayer()
  const sp = await searchParams
  const tab = parseBetTab(sp.tab)
  const page = parsePage(sp.page)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My bets</h1>
      <FilterChips
        label="Bet status"
        chips={BET_TABS.map((t) => ({ label: BET_TAB_LABELS[t], href: `/bets?tab=${t}`, active: t === tab }))}
      />
      <BetGroups userId={user.id} tab={tab} page={page} />
    </div>
  )
}

async function BetGroups({ userId, tab, page }: { userId: string; tab: BetTab; page: number }) {
  const result = await listMyBetsGrouped(userId, tab, page)
  const now = new Date()
  if (result.rows.length === 0) return <EmptyState>{EMPTY[tab]}</EmptyState>
  return (
    <>
      <ul className="space-y-3">
        {result.rows.map(({ game, bets }) => (
          <li key={game.id} className="bg-card border-border rounded-xl border">
            <Link
              href={`/games/${game.id}`}
              className="border-border hover:bg-surface-2 flex items-center gap-3 rounded-t-xl border-b p-3"
            >
              <TeamBadge abbr={game.awayTeam} size="sm" />
              <span className="font-semibold">
                {game.awayTeam} @ {game.homeTeam}
              </span>
              <TeamBadge abbr={game.homeTeam} size="sm" />
              <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
                {formatTipoff(game.startsAt)}
              </span>
              <StatusPill status={displayStatus(game, now)} />
            </Link>
            <ul className="divide-border divide-y px-3">
              {bets.map((b) => (
                <li key={b.id} className="grid grid-cols-3 items-center gap-2 py-2 text-sm">
                  <span className="num font-semibold">{formatEnding(b)}</span>
                  <SplitAmount
                    wallet={b.stake - b.pointsStake}
                    points={b.pointsStake}
                    className="text-muted-foreground"
                  />
                  <span className="text-right">
                    <BetResult result={b.result} payout={b.payout} pointsStake={b.pointsStake} />
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <Pagination basePath="/bets" params={{ tab }} page={result.page} pageCount={result.pageCount} />
    </>
  )
}
