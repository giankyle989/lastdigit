import { Prisma, type User } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'

import { postEntry } from './ledger'
import { hashPassword, verifyPassword } from './passwords'
import { generateReferralCode } from './referral-code'
import { getBonus } from './settings'

export const usernameSchema = z
  .string({ required_error: 'Username is required' })
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Username must be 3–20 letters, numbers or underscores')

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')

const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined),
})

function isUniqueViolation(e: unknown, field: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    JSON.stringify(e.meta?.target ?? '').includes(field)
  )
}

export async function registerPlayer(input: unknown): Promise<User> {
  const { username, password, referralCode } = registerSchema.parse(input)
  const passwordHash = await hashPassword(password)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        let referrerId: string | undefined
        if (referralCode) {
          const referrer = await tx.user.findUnique({ where: { referralCode } })
          if (!referrer) throw new DomainError('INVALID_REFERRAL', 'Referral code not found')
          referrerId = referrer.id
        }
        const user = await tx.user.create({
          data: {
            username,
            usernameKey: username.toLowerCase(),
            passwordHash,
            referralCode: generateReferralCode(),
            referredById: referrerId,
          },
        })
        // The referrer is paid later, when this player's first bet settles (see settlement.ts).
        const bonus = await getBonus('signupBonus', tx)
        if (bonus > 0) {
          await postEntry(tx, { userId: user.id, type: 'SIGNUP_BONUS', amount: bonus, note: 'Welcome bonus' })
          return tx.user.findUniqueOrThrow({ where: { id: user.id } })
        }
        return user
      })
    } catch (e) {
      if (isUniqueViolation(e, 'usernameKey')) {
        throw new DomainError('USERNAME_TAKEN', 'That username is already taken')
      }
      if (isUniqueViolation(e, 'referralCode')) continue // generated code collided; retry
      throw e
    }
  }
  throw new Error('Could not generate a unique referral code')
}

export async function verifyCredentials(
  username: string,
  password: string,
  now: Date = new Date(),
): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { usernameKey: username.trim().toLowerCase() } })
  if (!user) return null
  if (!(await verifyPassword(password, user.passwordHash))) return null
  if (isSuspended(user, now)) return null
  return user
}
