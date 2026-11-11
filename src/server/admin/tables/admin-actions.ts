import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import { parseOption, type SearchParams, TABLE_PAGE_SIZE } from '@/lib/table-params'

import { ADMIN_ACTION_TYPES, type AdminActionType } from '../../audit'

export type AdminActionListParams = { page: number; action?: AdminActionType }

export function parseAdminActionListParams(sp: SearchParams): AdminActionListParams {
  return { page: parsePage(sp.page), action: parseOption(sp.action, ADMIN_ACTION_TYPES) }
}

const include = {
  admin: { select: { username: true } },
  targetUser: { select: { id: true, username: true } },
  targetGame: { select: { id: true, awayTeam: true, homeTeam: true } },
} satisfies Prisma.AdminActionInclude

export type AdminActionRow = Prisma.AdminActionGetPayload<{ include: typeof include }>

/** Admin action log, newest first (sorting is fixed). */
export async function listAdminActions(p: AdminActionListParams): Promise<Page<AdminActionRow>> {
  const where: Prisma.AdminActionWhereInput = p.action ? { action: p.action } : {}
  const total = await prisma.adminAction.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const rows = await prisma.adminAction.findMany({
    where,
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
