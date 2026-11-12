import { GameStatus, type Prisma } from '@prisma/client'

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

export const GAME_SORTS = ['tipoff', 'pool', 'houseTake', 'status'] as const
export const GAME_STATUSES = Object.values(GameStatus)

export type GameListParams = {
  q?: string
  sort: Sort<(typeof GAME_SORTS)[number]>
  page: number
  status?: GameStatus
  /** ET dates, inclusive. */
  from?: string
  to?: string
}

export function parseGameListParams(sp: SearchParams): GameListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, GAME_SORTS, { field: 'tipoff', dir: 'desc' }),
    page: parsePage(sp.page),
    status: parseOption(sp.status, GAME_STATUSES),
    from: parseEtDateParam(sp.from),
    to: parseEtDateParam(sp.to),
  }
}

function orderBy(sort: GameListParams['sort']): Prisma.GameOrderByWithRelationInput {
  switch (sort.field) {
    case 'tipoff':
      return { startsAt: sort.dir }
    case 'pool':
      return { pool: sort.dir }
    case 'houseTake':
      return { houseTake: sort.dir }
    case 'status':
      return { status: sort.dir }
  }
}

const include = { _count: { select: { bets: { where: { result: 'WON' } } } } } satisfies Prisma.GameInclude

export type GameRow = Prisma.GameGetPayload<{ include: typeof include }>

export async function listGames(p: GameListParams): Promise<Page<GameRow>> {
  const team = p.q?.toUpperCase()
  const startsAt = etDateBounds(p.from, p.to)
  const where: Prisma.GameWhereInput = {
    ...(p.status ? { status: p.status } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(team ? { OR: [{ awayTeam: { contains: team } }, { homeTeam: { contains: team } }] } : {}),
  }
  const total = await prisma.game.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const rows = await prisma.game.findMany({
    where,
    include,
    orderBy: [orderBy(p.sort), { id: 'asc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
