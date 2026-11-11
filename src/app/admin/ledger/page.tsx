import Link from 'next/link'

import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { SelectField } from '@/components/admin/select-field'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { formatSort, type SearchParams } from '@/lib/table-params'
import { TX_TYPE_LABELS } from '@/lib/wallet'
import {
  LEDGER_TYPES,
  type LedgerListParams,
  type LedgerRow,
  listLedger,
  parseLedgerListParams,
} from '@/server/admin/tables/ledger'
import { requireAdmin } from '@/server/session'

const BASE = '/admin/ledger'

export default async function AdminLedgerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parseLedgerListParams(sp)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Ledger" />
      <FilterForm key={formKey} action={BASE} keep={{ sort: formatSort(params.sort) }}>
        <Field id="q" label="Username">
          <Input id="q" name="q" defaultValue={params.q ?? ''} className="w-40" />
        </Field>
        <SelectField
          id="type"
          name="type"
          label="Type"
          defaultValue={params.type ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            ...LEDGER_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABELS[t] })),
          ]}
        />
        <Field id="from" label="From (ET)">
          <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </Field>
        <Field id="to" label="To (ET)">
          <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </Field>
      </FilterForm>
      <LedgerTable sp={sp} params={params} />
    </>
  )
}

async function LedgerTable({ sp, params }: { sp: SearchParams; params: LedgerListParams }) {
  const result = await listLedger(params)
  return (
    <DataTable<LedgerRow>
      basePath={BASE}
      params={sp}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(t) => t.id}
      empty="No transactions."
      columns={[
        { key: 'time', header: 'Time', sort: 'time', cell: (t) => formatDateTime(t.createdAt) },
        {
          key: 'player',
          header: 'Player',
          cell: (t) => (
            <Link href={`/admin/players?player=${t.user.id}`} className="text-primary hover:underline">
              {t.user.username}
            </Link>
          ),
        },
        { key: 'type', header: 'Type', cell: (t) => TX_TYPE_LABELS[t.type] },
        {
          key: 'amount',
          header: 'Amount',
          sort: 'amount',
          align: 'right',
          cell: (t) => <PointsAmount value={t.amount} signed />,
        },
        {
          key: 'balanceAfter',
          header: 'Balance after',
          align: 'right',
          cell: (t) => <PointsAmount value={t.balanceAfter} />,
        },
        { key: 'note', header: 'Note', cell: (t) => t.note ?? '' },
      ]}
      footer={
        <tr>
          <td colSpan={3} className="px-3 py-2">
            Total for this filter
          </td>
          <td className="px-3 py-2 text-right">
            <PointsAmount value={result.totalAmount} signed />
          </td>
          <td colSpan={2} />
        </tr>
      }
    />
  )
}
