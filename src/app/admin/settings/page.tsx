import { ActionForm } from '@/components/action-form'
import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { PageHeader } from '@/components/admin/page-header'
import { FilterChips } from '@/components/filter-chips'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import type { SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import {
  type AdminActionListParams,
  type AdminActionRow,
  listAdminActions,
  parseAdminActionListParams,
} from '@/server/admin/tables/admin-actions'
import { ADMIN_ACTION_TYPES } from '@/server/audit'
import { requireAdmin } from '@/server/session'
import { type BonusKey, getBonuses } from '@/server/settings'

import { bonusesAction } from '../actions'

const BASE = '/admin/settings'

const BONUS_FIELDS: { key: BonusKey; label: string; hint: string }[] = [
  {
    key: 'welcomeBonusCap',
    label: 'Welcome bonus cap',
    hint: "A player's first top-up is matched 1:1 up to this; 0 turns it off",
  },
  {
    key: 'referralBonus',
    label: 'Referral bonus',
    hint: "Paid to the referrer when the new player's first bet settles",
  },
  {
    key: 'dailyBonus',
    label: 'Daily bonus',
    hint: 'Claimable once per PHT day from the wallet; 0 turns it off',
  },
]

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parseAdminActionListParams(sp)
  const bonuses = await getBonuses()

  return (
    <>
      <PageHeader title="Settings" />
      <Card className="mb-6 max-w-sm">
        <CardHeader>
          <CardTitle>Bonuses</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={bonusesAction} submitLabel="Save" className="grid gap-3">
            {BONUS_FIELDS.map((f) => (
              <Field key={f.key} id={f.key} label={f.label}>
                <Input
                  id={f.key}
                  name={f.key}
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={bonuses[f.key]}
                  required
                />
                <p className="text-muted-foreground text-xs">{f.hint}</p>
              </Field>
            ))}
          </ActionForm>
        </CardContent>
      </Card>
      <h2 className="mb-2 text-lg font-semibold">Admin action log</h2>
      <div className="mb-3">
        <FilterChips
          label="Action type"
          chips={[
            { label: 'All', href: BASE, active: params.action === undefined },
            ...ADMIN_ACTION_TYPES.map((a) => ({
              label: a,
              href: hrefWith(BASE, {}, { action: a }),
              active: params.action === a,
            })),
          ]}
        />
      </div>
      <ActionLog sp={sp} params={params} />
    </>
  )
}

async function ActionLog({ sp, params }: { sp: SearchParams; params: AdminActionListParams }) {
  const log = await listAdminActions(params)
  return (
    <DataTable<AdminActionRow>
      basePath={BASE}
      params={sp}
      sort="-time"
      page={log.page}
      pageCount={log.pageCount}
      total={log.total}
      rows={log.rows}
      rowKey={(a) => a.id}
      empty="No admin actions yet."
      columns={[
        { key: 'time', header: 'Time', cell: (a) => formatDateTime(a.createdAt) },
        { key: 'admin', header: 'Admin', cell: (a) => a.admin.username },
        { key: 'action', header: 'Action', cell: (a) => a.action },
        {
          key: 'target',
          header: 'Target',
          cell: (a) =>
            a.targetUser?.username ??
            (a.targetGame ? `${a.targetGame.awayTeam} @ ${a.targetGame.homeTeam}` : '—'),
        },
        {
          key: 'details',
          header: 'Details',
          cell: (a) => <span className="num text-muted-foreground text-xs">{JSON.stringify(a.details)}</span>,
        },
      ]}
    />
  )
}
