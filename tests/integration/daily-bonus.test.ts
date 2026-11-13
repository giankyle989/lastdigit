import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { canClaimDailyBonus, claimDailyBonus } from '@/server/bonuses'
import { setBonuses } from '@/server/settings'

import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

const NOV_12_0900_PHT = new Date('2026-11-12T01:00:00Z')
const NOV_12_2359_PHT = new Date('2026-11-12T15:59:59Z')
const NOV_13_0000_PHT = new Date('2026-11-12T16:00:00Z')

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).balance
}

describe('daily bonus', () => {
  beforeEach(async () => {
    await resetDb()
    // off by default; these tests turn it on at 100
    await prisma.setting.create({ data: { key: 'dailyBonus', value: '100' } })
  })

  it('is off by default', async () => {
    await prisma.setting.deleteMany()
    const u = await makeUser()
    await expect(claimDailyBonus(u.id, NOV_12_0900_PHT)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('credits the bonus once per PHT day', async () => {
    const u = await makeUser()
    expect(await claimDailyBonus(u.id, NOV_12_0900_PHT)).toBe(100)
    await expect(claimDailyBonus(u.id, NOV_12_2359_PHT)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await balanceOf(u.id)).toBe(100)
    expect(await claimDailyBonus(u.id, NOV_13_0000_PHT)).toBe(100) // a new PHT day
    expect(await balanceOf(u.id)).toBe(200)
    const t = await prisma.transaction.findFirstOrThrow({ where: { userId: u.id } })
    expect(t).toMatchObject({ type: 'DAILY_BONUS', amount: 100, note: 'Daily bonus' })
    await expectLedgerConsistent()
  })

  it('concurrent claims credit once', async () => {
    const u = await makeUser()
    const results = await Promise.allSettled([
      claimDailyBonus(u.id, NOV_12_0900_PHT),
      claimDailyBonus(u.id, NOV_12_0900_PHT),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balanceOf(u.id)).toBe(100)
  })

  it('uses the configured amount and refuses when it is 0', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const u = await makeUser()
    await setBonuses(admin.id, { welcomeBonusCap: 1000, referralBonus: 500, dailyBonus: 0 })
    await expect(claimDailyBonus(u.id, NOV_12_0900_PHT)).rejects.toMatchObject({ code: 'CONFLICT' })
    await setBonuses(admin.id, { welcomeBonusCap: 1000, referralBonus: 500, dailyBonus: 25 })
    expect(await claimDailyBonus(u.id, NOV_12_0900_PHT)).toBe(25)
  })

  it('refuses suspended players', async () => {
    const u = await makeUser({ status: 'SUSPENDED' })
    await expect(claimDailyBonus(u.id, NOV_12_0900_PHT)).rejects.toMatchObject({ code: 'SUSPENDED' })
  })

  it('canClaimDailyBonus follows the PHT day', () => {
    expect(canClaimDailyBonus({ lastDailyBonusOn: null }, NOV_12_0900_PHT)).toBe(true)
    expect(canClaimDailyBonus({ lastDailyBonusOn: '2026-11-12' }, NOV_12_2359_PHT)).toBe(false)
    expect(canClaimDailyBonus({ lastDailyBonusOn: '2026-11-12' }, NOV_13_0000_PHT)).toBe(true)
  })
})
