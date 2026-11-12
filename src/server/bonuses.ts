import { localDateOf } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'

import { postEntry } from './ledger'
import { getBonus } from './settings'

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
    await postEntry(tx, { userId, type: 'DAILY_BONUS', amount, note: 'Daily bonus' })
    return amount
  })
}
