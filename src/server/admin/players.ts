import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { MAX_GRANT, MAX_STAKE } from '@/lib/game/limits'
import { phoneSchema } from '@/lib/phone'
import { intFromForm } from '@/lib/validation'

import { logAdminAction } from '../audit'
import { lockUsers, postEntry } from '../ledger'
import { hashPassword } from '../passwords'
import { getBonuses } from '../settings'
import { passwordSchema } from '../users'

async function requirePlayer(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'PLAYER') throw new DomainError('NOT_FOUND', 'Player not found')
  return user
}

const adjustSchema = z.object({
  direction: z.enum(['GRANT', 'DEDUCT'], { errorMap: () => ({ message: 'Choose grant or deduct' }) }),
  amount: intFromForm('Amount', 1, MAX_GRANT),
  note: z.string({ required_error: 'A note is required' }).trim().min(1, 'A note is required').max(500),
})

/**
 * Grants or deducts points. A player's first grant is their first top-up:
 * - it is matched 1:1 as a welcome bonus, up to `welcomeBonusCap`;
 * - if they were referred, the referrer gets `referralPercent`% of it, up to `referralBonusCap`
 *   (once per referred player, guarded by `referralBonusPaidAt`), but only if the referrer's
 *   phone is confirmed.
 * Returns the bonuses credited (0 when none).
 */
export async function adjustPoints(
  adminId: string,
  userId: string,
  input: unknown,
): Promise<{ welcomeBonus: number; referralBonus: number }> {
  const { direction, amount, note } = adjustSchema.parse(input)
  return prisma.$transaction(async (tx) => {
    const player = await requirePlayer(tx, userId)
    const grant = direction === 'GRANT'
    // Lock the player (and referrer) first so two concurrent first grants can't both see
    // "no earlier grant".
    await lockUsers(tx, player.referredById ? [userId, player.referredById] : [userId])
    if (grant) {
      const { phoneConfirmedAt } = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { phoneConfirmedAt: true },
      })
      if (!phoneConfirmedAt) throw new DomainError('PHONE_NOT_CONFIRMED', 'Confirm the phone number first')
    }
    const firstTopUp = grant && (await tx.transaction.count({ where: { userId, type: 'ADMIN_GRANT' } })) === 0
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
    if (!firstTopUp) return { welcomeBonus: 0, referralBonus: 0 }
    const bonuses = await getBonuses(tx)
    const welcomeBonus = Math.min(amount, bonuses.welcomeBonusCap)
    if (welcomeBonus > 0) {
      await postEntry(tx, {
        userId,
        type: 'SIGNUP_BONUS',
        amount: welcomeBonus,
        adminId,
        note: 'Welcome bonus: first top-up matched',
      })
    }

    let referralBonus = 0
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const referrer = fresh.referredById
      ? await tx.user.findUnique({ where: { id: fresh.referredById }, select: { phoneConfirmedAt: true } })
      : null
    // Only a referrer with a confirmed phone is paid, so an unconfirmed alt can't farm the bonus.
    if (fresh.referredById && !fresh.referralBonusPaidAt && referrer?.phoneConfirmedAt) {
      referralBonus = Math.min(Math.floor((amount * bonuses.referralPercent) / 100), bonuses.referralBonusCap)
      if (referralBonus > 0) {
        await tx.user.update({ where: { id: userId }, data: { referralBonusPaidAt: new Date() } })
        await postEntry(tx, {
          userId: fresh.referredById,
          type: 'REFERRAL_BONUS',
          amount: referralBonus,
          adminId,
          note: `Referral: ${fresh.username} topped up ${amount.toLocaleString('en-US')}`,
        })
      }
    }
    return { welcomeBonus, referralBonus }
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

const stakeLimitSchema = z.union([z.null(), intFromForm('Stake limit', 1, MAX_STAKE)])

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

/** Sets or changes a player's number (admin only). A new number must be confirmed again. */
export async function setPhone(adminId: string, userId: string, input: unknown): Promise<void> {
  const phone = phoneSchema.parse(input)
  try {
    await prisma.$transaction(async (tx) => {
      const player = await requirePlayer(tx, userId)
      if (player.phone === phone) return
      await tx.user.update({
        where: { id: userId },
        data: { phone, phoneConfirmedAt: null, phoneConfirmedById: null },
      })
      await logAdminAction(tx, {
        adminId,
        action: 'UPDATE_PHONE',
        targetUserId: userId,
        details: { from: player.phone, to: phone },
      })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError('PHONE_TAKEN', 'This number is already registered.')
    }
    throw e
  }
}

/** The admin matched the number to a top-up payment; grants are allowed from now on. */
export async function confirmPhone(adminId: string, userId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const player = await requirePlayer(tx, userId)
    if (!player.phone) throw new DomainError('VALIDATION', 'Add a phone number first')
    // Guard on the number we read, so a concurrent edit is not confirmed by mistake.
    const { count } = await tx.user.updateMany({
      where: { id: userId, phone: player.phone },
      data: { phoneConfirmedAt: now, phoneConfirmedById: adminId },
    })
    if (count === 0) throw new DomainError('CONFLICT', 'The number changed. Reload and try again.')
    await logAdminAction(tx, {
      adminId,
      action: 'CONFIRM_PHONE',
      targetUserId: userId,
      details: { phone: player.phone },
    })
  })
}
