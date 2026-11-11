import { type Prisma, TransactionType } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import {
  etDateBounds,
  parseEtDateParam,
  parseOption,
  parseSearch,
  parseSort,
  type SearchParams,
  type Sort,
  TABLE_PAGE_SIZE,
} from '@/lib/table-params'

export const LEDGER_SORTS = ['time', 'amount'] as const
export const LEDGER_TYPES = Object.values(TransactionType)

export type LedgerListParams = {
  /** Username search (contains, case-insensitive). */
  q?: string
  sort: Sort<(typeof LEDGER_SORTS)[number]>
  page: number
  type?: TransactionType
  from?: string
  to?: string
}

export function parseLedgerListParams(sp: SearchParams): LedgerListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, LEDGER_SORTS, { field: 'time', dir: 'desc' }),
    page: parsePage(sp.page),
    type: parseOption(sp.type, LEDGER_TYPES),
    from: parseEtDateParam(sp.from),
    to: parseEtDateParam(sp.to),
  }
}

const include = { user: { select: { id: true, username: true } } } satisfies Prisma.TransactionInclude

export type LedgerRow = Prisma.TransactionGetPayload<{ include: typeof include }>

/** Ledger rows plus the sum of amounts for the whole filter (spec §5.5 totals row). */
export async function listLedger(p: LedgerListParams): Promise<Page<LedgerRow> & { totalAmount: number }> {
  const createdAt = etDateBounds(p.from, p.to)
  const where: Prisma.TransactionWhereInput = {
    ...(p.q ? { user: { usernameKey: { contains: p.q.toLowerCase() } } } : {}),
    ...(p.type ? { type: p.type } : {}),
    ...(createdAt ? { createdAt } : {}),
  }
  const [total, sum] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
  ])
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const field = p.sort.field === 'time' ? 'createdAt' : 'amount'
  const rows = await prisma.transaction.findMany({
    where,
    include,
    orderBy: [{ [field]: p.sort.dir }, { id: p.sort.dir }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount, totalAmount: sum._sum.amount ?? 0 }
}
