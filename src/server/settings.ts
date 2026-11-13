import { z } from 'zod'

import { prisma, type Tx } from '@/lib/db'
import { intFromForm } from '@/lib/validation'

import { logAdminAction } from './audit'

/** Admin-configurable point bonuses (Admin → Settings) and their defaults. */
/**
 * - welcomeBonusCap: a player's first top-up (admin grant) is matched 1:1 up to this.
 * - referralPercent / referralBonusCap: when a referred player first tops up, their referrer gets
 *   this percent of the top-up, up to the cap.
 * - dailyBonus: off (0) by default while the game is in its starting phase.
 */
export const BONUS_DEFAULTS = {
  welcomeBonusCap: 1000,
  referralPercent: 50,
  referralBonusCap: 200,
  dailyBonus: 0,
} as const
export type BonusKey = keyof typeof BONUS_DEFAULTS
export type Bonuses = Record<BonusKey, number>
const BONUS_KEYS = Object.keys(BONUS_DEFAULTS) as BonusKey[]

export async function getBonuses(db: Tx = prisma): Promise<Bonuses> {
  const rows = await db.setting.findMany({ where: { key: { in: BONUS_KEYS } } })
  const stored = new Map(rows.map((r) => [r.key, Number(r.value)]))
  return Object.fromEntries(BONUS_KEYS.map((k) => [k, stored.get(k) ?? BONUS_DEFAULTS[k]])) as Bonuses
}

export async function getBonus(key: BonusKey, db: Tx = prisma): Promise<number> {
  return (await getBonuses(db))[key]
}

const bonusesSchema = z.object({
  welcomeBonusCap: intFromForm('Welcome bonus cap', 0, 1_000_000),
  referralPercent: intFromForm('Referral percent', 0, 100),
  referralBonusCap: intFromForm('Referral bonus cap', 0, 1_000_000),
  dailyBonus: intFromForm('Daily bonus', 0, 1_000_000),
})

export async function setBonuses(adminId: string, input: unknown): Promise<void> {
  const bonuses = bonusesSchema.parse(input)
  await prisma.$transaction(async (tx) => {
    for (const key of BONUS_KEYS) {
      const value = String(bonuses[key])
      await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    }
    await logAdminAction(tx, { adminId, action: 'UPDATE_SETTING', details: bonuses })
  })
}

export async function getLastSyncAt(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: 'lastSyncAt' } })
  return row ? new Date(row.value) : null
}

export async function setLastSyncAt(at: Date): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'lastSyncAt' },
    update: { value: at.toISOString() },
    create: { key: 'lastSyncAt', value: at.toISOString() },
  })
}
