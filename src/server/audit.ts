import type { Prisma } from '@prisma/client'

import type { Tx } from '@/lib/db'

export const ADMIN_ACTION_TYPES = [
  'SUSPEND',
  'UNSUSPEND',
  'SET_STAKE_LIMIT',
  'RESET_PASSWORD',
  'VOID_GAME',
  'UPDATE_SETTING',
  'GRANT_POINTS',
  'DEDUCT_POINTS',
  'UPDATE_PHONE',
  'CONFIRM_PHONE',
  'CREATE_STAFF',
  'DISABLE_STAFF',
  'ENABLE_STAFF',
  'RESET_STAFF_PASSWORD',
] as const

export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number]

export async function logAdminAction(
  tx: Tx,
  a: {
    adminId: string
    action: AdminActionType
    targetUserId?: string
    targetGameId?: string
    details?: Prisma.InputJsonObject
  },
) {
  await tx.adminAction.create({ data: { ...a, details: a.details ?? {} } })
}
