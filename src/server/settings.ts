import { prisma, type Tx } from '@/lib/db'
import { intFromForm } from '@/lib/validation'

import { logAdminAction } from './audit'

const DEFAULT_REFERRAL_BONUS = 500

export async function getReferralBonus(db: Tx = prisma): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: 'referralBonus' } })
  return row ? Number(row.value) : DEFAULT_REFERRAL_BONUS
}

export async function setReferralBonus(adminId: string, value: unknown): Promise<void> {
  const bonus = intFromForm('Referral bonus', 0, 1_000_000).parse(value)
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: 'referralBonus' },
      update: { value: String(bonus) },
      create: { key: 'referralBonus', value: String(bonus) },
    })
    await logAdminAction(tx, {
      adminId,
      action: 'UPDATE_SETTING',
      details: { key: 'referralBonus', value: bonus },
    })
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
