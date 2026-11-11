import type { Prisma } from '@prisma/client'

import type { Tx } from '@/lib/db'

export type AdminActionType =
  | 'SUSPEND'
  | 'UNSUSPEND'
  | 'SET_STAKE_LIMIT'
  | 'RESET_PASSWORD'
  | 'VOID_GAME'
  | 'UPDATE_SETTING'
  | 'GRANT_POINTS'
  | 'DEDUCT_POINTS'

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
