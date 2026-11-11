import type { Prisma } from '@prisma/client'

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

export const PLAYER_SORTS = ['username', 'balance', 'joined', 'referrals'] as const
export const PLAYER_STATUSES = ['active', 'suspended'] as const

export type PlayerListParams = {
  q?: string
  sort: Sort<(typeof PLAYER_SORTS)[number]>
  page: number
  status?: (typeof PLAYER_STATUSES)[number]
}

export function parsePlayerListParams(sp: SearchParams): PlayerListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, PLAYER_SORTS, { field: 'joined', dir: 'desc' }),
    page: parsePage(sp.page),
    status: parseOption(sp.status, PLAYER_STATUSES),
  }
}

function orderBy(sort: PlayerListParams['sort']): Prisma.UserOrderByWithRelationInput {
  switch (sort.field) {
    case 'username':
      return { usernameKey: sort.dir }
    case 'balance':
      return { balance: sort.dir }
    case 'joined':
      return { createdAt: sort.dir }
    case 'referrals':
      return { referrals: { _count: sort.dir } }
  }
}

const select = {
  id: true,
  username: true,
  balance: true,
  status: true,
  suspendedUntil: true,
  stakeLimitPerGame: true,
  createdAt: true,
  _count: { select: { referrals: true } },
} satisfies Prisma.UserSelect

export type PlayerRow = Prisma.UserGetPayload<{ select: typeof select }>

export async function listPlayers(p: PlayerListParams, now: Date = new Date()): Promise<Page<PlayerRow>> {
  const suspendedNow: Prisma.UserWhereInput = {
    status: 'SUSPENDED',
    OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
  }
  const where: Prisma.UserWhereInput = {
    role: 'PLAYER',
    ...(p.q ? { usernameKey: { contains: p.q.toLowerCase() } } : {}),
    ...(p.status === 'suspended' ? suspendedNow : p.status === 'active' ? { NOT: suspendedNow } : {}),
  }
  const total = await prisma.user.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const rows = await prisma.user.findMany({
    where,
    select,
    orderBy: [orderBy(p.sort), { id: 'asc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
