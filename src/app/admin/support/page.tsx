import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { UrlSheet } from '@/components/admin/url-sheet'
import { FilterChips } from '@/components/filter-chips'
import { Input } from '@/components/ui/input'
import { DomainError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { firstParam } from '@/lib/pagination'
import { formatSort, isRecordId, type SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import {
  listTickets,
  parseTicketListParams,
  TICKET_STATUSES,
  type TicketListParams,
  type TicketRow,
} from '@/server/admin/tables/tickets'
import { getInquiryThread } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'

import { TicketDrawer } from './ticket-drawer'

const BASE = '/admin/support'

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const params = parseTicketListParams(sp)
  const drawerId = firstParam(sp.ticket)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Support" />
      <FilterChips
        label="Ticket status"
        chips={TICKET_STATUSES.map((s) => ({
          label: s,
          href: hrefWith(BASE, { q: params.q }, { status: s }),
          active: s === params.status,
        }))}
      />
      <div className="mt-3">
        <FilterForm
          key={formKey}
          action={BASE}
          keep={{ status: params.status, sort: formatSort(params.sort) }}
        >
          <Field id="q" label="Search subject or username">
            <Input id="q" name="q" defaultValue={params.q ?? ''} className="w-56" />
          </Field>
        </FilterForm>
      </div>
      <TicketsTable sp={sp} params={params} />
      {drawerId !== undefined && <TicketSheet sp={sp} id={drawerId} adminId={admin.id} />}
    </>
  )
}

async function TicketsTable({ sp, params }: { sp: SearchParams; params: TicketListParams }) {
  const result = await listTickets(params)
  return (
    <DataTable<TicketRow>
      basePath={BASE}
      params={{ ...sp, ticket: undefined }}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(t) => t.id}
      rowLink={(t) => ({ href: hrefWith(BASE, sp, { ticket: t.id }), label: t.subject })}
      empty="Nothing here."
      columns={[
        { key: 'subject', header: 'Subject', cell: (t) => t.subject },
        { key: 'player', header: 'Player', cell: (t) => t.user.username },
        { key: 'messages', header: 'Messages', align: 'right', cell: (t) => t._count.messages },
        { key: 'created', header: 'Opened', sort: 'created', cell: (t) => formatDateTime(t.createdAt) },
        { key: 'updated', header: 'Updated', sort: 'updated', cell: (t) => formatDateTime(t.updatedAt) },
      ]}
    />
  )
}

async function TicketSheet({ sp, id, adminId }: { sp: SearchParams; id: string; adminId: string }) {
  // getInquiryThread throws NOT_FOUND for unknown ids: show "Not found" instead of an error page.
  const thread = isRecordId(id)
    ? await getInquiryThread(adminId, id).catch((e: unknown) => {
        if (e instanceof DomainError) return null
        throw e
      })
    : null
  return (
    <UrlSheet
      key={id}
      closeHref={hrefWith(BASE, sp, { ticket: undefined })}
      title={thread?.subject ?? 'Not found'}
    >
      {thread ? <TicketDrawer thread={thread} /> : <p className="text-muted-foreground">Ticket not found.</p>}
    </UrlSheet>
  )
}
