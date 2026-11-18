import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { SelectField } from '@/components/admin/select-field'
import { UrlSheet } from '@/components/admin/url-sheet'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { firstParam } from '@/lib/pagination'
import { isSuspended } from '@/lib/suspension'
import { formatSort, isRecordId, type SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { getPlayerDetail } from '@/server/admin/queries'
import {
  listPlayers,
  parsePlayerListParams,
  type PlayerListParams,
  type PlayerRow,
} from '@/server/admin/tables/players'
import { requireAdmin } from '@/server/session'
import { linkedAccounts, sharedDevicePlayerIds } from '@/server/sightings'

import { PlayerDrawer } from './player-drawer'

const BASE = '/admin/players'

export default async function AdminPlayersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parsePlayerListParams(sp)
  const sort = formatSort(params.sort)
  const drawerId = firstParam(sp.player)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Players" />
      <FilterForm key={formKey} action={BASE} keep={{ sort }}>
        <Field id="q" label="Search players">
          <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Username" className="w-48" />
        </Field>
        <SelectField
          id="status"
          name="status"
          label="Status"
          defaultValue={params.status ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <SelectField
          id="flag"
          name="flag"
          label="Flags"
          defaultValue={params.flag ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            { value: 'shared-device', label: 'Shared device' },
          ]}
        />
      </FilterForm>
      <PlayersTable sp={sp} params={params} />
      {drawerId !== undefined && <PlayerSheet sp={sp} id={drawerId} />}
    </>
  )
}

async function PlayersTable({ sp, params }: { sp: SearchParams; params: PlayerListParams }) {
  const [result, sharedIds] = await Promise.all([listPlayers(params), sharedDevicePlayerIds()])
  const shared = new Set(sharedIds)
  return (
    <DataTable<PlayerRow>
      basePath={BASE}
      params={{ ...sp, player: undefined }}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(r) => r.id}
      rowLink={(r) => ({ href: hrefWith(BASE, sp, { player: r.id }), label: r.username })}
      empty="No players found."
      columns={[
        {
          key: 'username',
          header: 'Username',
          sort: 'username',
          cell: (r) => (
            <span className="flex items-center gap-2">
              {r.username}
              {shared.has(r.id) && (
                <span className="border-live text-live rounded border px-1 text-[10px] font-medium">
                  Shared device
                </span>
              )}
            </span>
          ),
        },
        {
          key: 'balance',
          header: 'Balance',
          sort: 'balance',
          align: 'right',
          cell: (r) => (
            <PointsAmount value={r.walletBalance} className={r.walletBalance < 0 ? 'text-danger' : ''} />
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (r) => (isSuspended(r) ? <span className="text-danger">Suspended</span> : 'Active'),
        },
        { key: 'limit', header: 'Stake limit', align: 'right', cell: (r) => r.stakeLimitPerGame ?? '—' },
        {
          key: 'referrals',
          header: 'Referrals',
          sort: 'referrals',
          align: 'right',
          cell: (r) => r._count.referrals,
        },
        { key: 'joined', header: 'Joined', sort: 'joined', cell: (r) => formatDateTime(r.createdAt) },
      ]}
    />
  )
}

async function PlayerSheet({ sp, id }: { sp: SearchParams; id: string }) {
  const [player, linked] = isRecordId(id)
    ? await Promise.all([getPlayerDetail(id), linkedAccounts(id)])
    : [null, []]
  return (
    <UrlSheet
      key={id}
      closeHref={hrefWith(BASE, sp, { player: undefined })}
      title={player?.username ?? 'Not found'}
    >
      {player ? (
        <PlayerDrawer player={player} linked={linked} />
      ) : (
        <p className="text-muted-foreground">Player not found.</p>
      )}
    </UrlSheet>
  )
}
