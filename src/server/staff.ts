import { Prisma, type Role, type User } from '@prisma/client'
import { z } from 'zod'

import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'

import { logAdminAction } from './audit'
import { assertCan } from './authz'
import { hashPassword } from './passwords'
import { generateReferralCode } from './referral-code'
import { passwordSchema, usernameSchema } from './users'

export type StaffRow = {
  id: string
  username: string
  role: Role
  disabled: boolean
  lastSeenAt: Date | null
}

const ROLE_ORDER: Record<Role, number> = { SUPERADMIN: 0, MANAGER: 1, PLAYER: 2 }

export async function listStaff(actorId: string): Promise<StaffRow[]> {
  await assertCan(prisma, actorId, 'staff.manage')
  const users = await prisma.user.findMany({
    where: { role: { in: ['SUPERADMIN', 'MANAGER'] } },
    include: { sightings: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } } },
  })
  return users
    .map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      disabled: isSuspended(u),
      lastSeenAt: u.sightings[0]?.lastSeenAt ?? null,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.username.localeCompare(b.username))
}

const createSchema = z.object({ username: usernameSchema, password: passwordSchema })

export async function createManager(actorId: string, input: unknown): Promise<User> {
  await assertCan(prisma, actorId, 'staff.manage')
  const { username, password } = createSchema.parse(input)
  const passwordHash = await hashPassword(password)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            usernameKey: username.toLowerCase(),
            passwordHash,
            role: 'MANAGER',
            referralCode: generateReferralCode(),
          },
        })
        await logAdminAction(tx, {
          adminId: actorId,
          action: 'CREATE_STAFF',
          targetUserId: user.id,
          details: { username },
        })
        return user
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = JSON.stringify(e.meta?.target ?? '')
        if (target.includes('usernameKey')) {
          throw new DomainError('USERNAME_TAKEN', 'That username is already taken')
        }
        if (target.includes('referralCode')) continue
      }
      throw e
    }
  }
  throw new Error('Could not generate a unique referral code')
}

/** Staff-page actions only ever change managers: never a superadmin, the actor, or a player. */
async function lockManager(tx: Tx, actorId: string, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ role: Role }[]>`SELECT role FROM "User" WHERE id = ${userId} FOR UPDATE`
  if (userId === actorId || rows[0]?.role !== 'MANAGER') {
    throw new DomainError('FORBIDDEN', 'Only managers can be changed here')
  }
}

export async function setStaffDisabled(actorId: string, userId: string, disabled: boolean): Promise<void> {
  await assertCan(prisma, actorId, 'staff.manage')
  await prisma.$transaction(async (tx) => {
    await lockManager(tx, actorId, userId)
    await tx.user.update({
      where: { id: userId },
      data: { status: disabled ? 'SUSPENDED' : 'ACTIVE', suspendedUntil: null },
    })
    await logAdminAction(tx, {
      adminId: actorId,
      action: disabled ? 'DISABLE_STAFF' : 'ENABLE_STAFF',
      targetUserId: userId,
    })
  })
}

export async function resetStaffPassword(
  actorId: string,
  userId: string,
  newPassword: unknown,
): Promise<void> {
  await assertCan(prisma, actorId, 'staff.manage')
  const passwordHash = await hashPassword(passwordSchema.parse(newPassword))
  await prisma.$transaction(async (tx) => {
    await lockManager(tx, actorId, userId)
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await logAdminAction(tx, { adminId: actorId, action: 'RESET_STAFF_PASSWORD', targetUserId: userId })
  })
}
