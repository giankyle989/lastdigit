import { InquiryStatus, type Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import {
  parseOption,
  parseSearch,
  parseSort,
  type SearchParams,
  type Sort,
  TABLE_PAGE_SIZE,
} from '@/lib/table-params'

export const TICKET_SORTS = ['updated', 'created'] as const
export const TICKET_STATUSES = Object.values(InquiryStatus)

export type TicketListParams = {
  q?: string
  sort: Sort<(typeof TICKET_SORTS)[number]>
  page: number
  status: InquiryStatus
}

export function parseTicketListParams(sp: SearchParams): TicketListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, TICKET_SORTS, { field: 'updated', dir: 'desc' }),
    page: parsePage(sp.page),
    status: parseOption(sp.status, TICKET_STATUSES) ?? 'OPEN',
  }
}

const include = {
  user: { select: { id: true, username: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.InquiryInclude

export type TicketRow = Prisma.InquiryGetPayload<{ include: typeof include }>

export async function listTickets(p: TicketListParams): Promise<Page<TicketRow>> {
  const where: Prisma.InquiryWhereInput = {
    status: p.status,
    ...(p.q
      ? {
          OR: [
            { subject: { contains: p.q, mode: 'insensitive' } },
            { user: { usernameKey: { contains: p.q.toLowerCase() } } },
          ],
        }
      : {}),
  }
  const total = await prisma.inquiry.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const field = p.sort.field === 'updated' ? 'updatedAt' : 'createdAt'
  const rows = await prisma.inquiry.findMany({
    where,
    include,
    orderBy: [{ [field]: p.sort.dir }, { id: 'asc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
