import { ActionForm } from '@/components/action-form'
import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { SelectField } from '@/components/admin/select-field'
import { UrlSheet } from '@/components/admin/url-sheet'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { Input } from '@/components/ui/input'
import { formatTipoff } from '@/lib/format'
import { displayStatus } from '@/lib/game/status'
import { firstParam } from '@/lib/pagination'
import { formatSort, isRecordId, type SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { getGameDetail } from '@/server/admin/queries'
import {
  GAME_STATUSES,
  type GameListParams,
  type GameRow,
  listGames,
  parseGameListParams,
} from '@/server/admin/tables/games'
import { requireAdmin } from '@/server/session'

import { forceSyncAction } from '../actions'
import { GameDrawer } from './game-drawer'

const BASE = '/admin/games'

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parseGameListParams(sp)
  const drawerId = firstParam(sp.game)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Games">
        <ActionForm action={forceSyncAction} submitLabel="Force sync" className="flex items-center gap-2" />
      </PageHeader>
      <FilterForm key={formKey} action={BASE} keep={{ sort: formatSort(params.sort) }}>
        <Field id="q" label="Team">
          <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="e.g. LAL" className="w-28" />
        </Field>
        <SelectField
          id="status"
          name="status"
          label="Status"
          defaultValue={params.status ?? 'all'}
          options={[{ value: 'all', label: 'All' }, ...GAME_STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        <Field id="from" label="From (PHT)">
          <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </Field>
        <Field id="to" label="To (PHT)">
          <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </Field>
      </FilterForm>
      <GamesTable sp={sp} params={params} />
      {drawerId !== undefined && <GameSheet sp={sp} id={drawerId} />}
    </>
  )
}

async function GamesTable({ sp, params }: { sp: SearchParams; params: GameListParams }) {
  const result = await listGames(params)
  const now = new Date()
  return (
    <DataTable<GameRow>
      basePath={BASE}
      params={{ ...sp, game: undefined }}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(g) => g.id}
      rowLink={(g) => ({ href: hrefWith(BASE, sp, { game: g.id }), label: `${g.awayTeam} @ ${g.homeTeam}` })}
      rowClassName={(g) => (g.status === 'POSTPONED' ? 'bg-live/10' : undefined)}
      empty="No games."
      columns={[
        { key: 'matchup', header: 'Matchup', cell: (g) => `${g.awayTeam} @ ${g.homeTeam}` },
        { key: 'tipoff', header: 'Tip-off', sort: 'tipoff', cell: (g) => formatTipoff(g.startsAt) },
        {
          key: 'status',
          header: 'Status',
          sort: 'status',
          cell: (g) => <StatusPill status={displayStatus(g, now)} />,
        },
        {
          key: 'score',
          header: 'Score',
          align: 'right',
          cell: (g) => `${g.awayScore ?? '–'}-${g.homeScore ?? '–'}`,
        },
        {
          key: 'pool',
          header: 'Pool',
          sort: 'pool',
          align: 'right',
          cell: (g) => <PointsAmount value={g.pool} />,
        },
        {
          key: 'houseTake',
          header: 'House take',
          sort: 'houseTake',
          align: 'right',
          cell: (g) => <PointsAmount value={g.houseTake} />,
        },
        { key: 'winners', header: 'Winners', align: 'right', cell: (g) => g._count.bets },
      ]}
    />
  )
}

async function GameSheet({ sp, id }: { sp: SearchParams; id: string }) {
  const detail = isRecordId(id) ? await getGameDetail(id) : null
  return (
    <UrlSheet
      key={id}
      closeHref={hrefWith(BASE, sp, { game: undefined })}
      title={detail ? `${detail.game.awayTeam} @ ${detail.game.homeTeam}` : 'Not found'}
    >
      {detail ? (
        <GameDrawer detail={detail} now={new Date()} />
      ) : (
        <p className="text-muted-foreground">Game not found.</p>
      )}
    </UrlSheet>
  )
}
