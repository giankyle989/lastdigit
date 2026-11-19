import { localDateOf } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isStaff } from '@/lib/permissions'
import { isSuspended } from '@/lib/suspension'

import { postEntry } from './ledger'
import { getBonus } from './settings'

export const DAILY_BONUS_NEEDS_PHONE = 'Confirm your number with support to claim the daily bonus'

/** True when the player hasn't claimed the daily bonus yet on this PHT calendar day. */
export function canClaimDailyBonus(
  user: { lastDailyBonusOn: string | null },
  now: Date = new Date(),
): boolean {
  return user.lastDailyBonusOn !== localDateOf(now)
}

/** Credits the daily bonus once per PHT calendar day; returns the amount credited. */
export async function claimDailyBonus(userId: string, now: Date = new Date()): Promise<number> {
  const today = localDateOf(now)
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (isSuspended(user, now)) throw new DomainError('SUSPENDED', 'Account suspended')
    if (isStaff(user.role)) throw new DomainError('FORBIDDEN', 'Staff accounts cannot claim bonuses')
    // Same rule as cash in and given points: free points only for a confirmed number.
    if (!user.phoneConfirmedAt) {
      throw new DomainError('PHONE_NOT_CONFIRMED', DAILY_BONUS_NEEDS_PHONE)
    }
    const amount = await getBonus('dailyBonus', tx)
    if (amount <= 0) throw new DomainError('CONFLICT', 'The daily bonus is turned off')
    // Conditional update: two concurrent claims on the same day credit once.
    const claimed = await tx.user.updateMany({
      where: { id: userId, OR: [{ lastDailyBonusOn: null }, { lastDailyBonusOn: { not: today } }] },
      data: { lastDailyBonusOn: today },
    })
    if (claimed.count === 0) {
      throw new DomainError('CONFLICT', 'Already claimed today — come back tomorrow')
    }
    await postEntry(tx, { account: 'POINTS', userId, type: 'DAILY_BONUS', amount, note: 'Daily bonus' })
    return amount
  })
}
