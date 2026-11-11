import { z } from 'zod'
import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { intFromForm } from '@/lib/validation'
import { logAdminAction } from '../audit'
import { postEntry } from '../ledger'
import { hashPassword } from '../passwords'
import { passwordSchema } from '../users'

async function requirePlayer(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'PLAYER') throw new DomainError('NOT_FOUND', 'Player not found')
  return user
}

const adjustSchema = z.object({
  direction: z.enum(['GRANT', 'DEDUCT'], { errorMap: () => ({ message: 'Choose grant or deduct' }) }),
  amount: intFromForm('Amount', 1, 1_000_000_000),
  note: z.string({ required_error: 'A note is required' }).trim().min(1, 'A note is required').max(500),
})

export async function adjustPoints(adminId: string, userId: string, input: unknown): Promise<void> {
  const { direction, amount, note } = adjustSchema.parse(input)
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    const grant = direction === 'GRANT'
    await postEntry(
      tx,
      {
        userId,
        type: grant ? 'ADMIN_GRANT' : 'ADMIN_DEDUCT',
        amount: grant ? amount : -amount,
        adminId,
        note,
      },
      { requireFunds: !grant },
    )
    await logAdminAction(tx, {
      adminId,
      action: grant ? 'GRANT_POINTS' : 'DEDUCT_POINTS',
      targetUserId: userId,
      details: { amount, note },
    })
  })
}

export async function suspendPlayer(
  adminId: string,
  userId: string,
  until: Date | null,
  now: Date = new Date(),
): Promise<void> {
  if (until && until <= now) throw new DomainError('VALIDATION', 'Suspension end must be in the future')
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { status: 'SUSPENDED', suspendedUntil: until } })
    await logAdminAction(tx, {
      adminId,
      action: 'SUSPEND',
      targetUserId: userId,
      details: { until: until ? until.toISOString() : null },
    })
  })
}

export async function unsuspendPlayer(adminId: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE', suspendedUntil: null } })
    await logAdminAction(tx, { adminId, action: 'UNSUSPEND', targetUserId: userId })
  })
}

const stakeLimitSchema = z.union([z.null(), intFromForm('Stake limit', 1, 1_000_000_000)])

export async function setStakeLimit(adminId: string, userId: string, limit: unknown): Promise<void> {
  const value = stakeLimitSchema.parse(limit)
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { stakeLimitPerGame: value } })
    await logAdminAction(tx, {
      adminId,
      action: 'SET_STAKE_LIMIT',
      targetUserId: userId,
      details: { limit: value },
    })
  })
}

export async function resetPassword(adminId: string, userId: string, newPassword: unknown): Promise<void> {
  const pw = passwordSchema.parse(newPassword)
  const passwordHash = await hashPassword(pw)
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await logAdminAction(tx, { adminId, action: 'RESET_PASSWORD', targetUserId: userId })
  })
}
