import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { getBonus, getBonuses, getLastSyncAt, setBonuses, setLastSyncAt } from '@/server/settings'

import { makeUser, resetDb } from '../helpers/db'

describe('settings', () => {
  beforeEach(resetDb)

  it('bonuses have defaults', async () => {
    expect(await getBonuses()).toEqual({
      welcomeBonusCap: 1000,
      referralPercent: 50,
      referralBonusCap: 500,
      dailyBonus: 0,
    })
    expect(await getBonus('referralBonusCap')).toBe(500)
  })

  it('admin can change the bonuses, and it is audited', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await setBonuses(admin.id, {
      welcomeBonusCap: '200',
      referralPercent: '20',
      referralBonusCap: '250',
      dailyBonus: '0',
    })
    expect(await getBonuses()).toEqual({
      welcomeBonusCap: 200,
      referralPercent: 20,
      referralBonusCap: 250,
      dailyBonus: 0,
    })
    const log = await prisma.adminAction.findFirstOrThrow()
    expect(log).toMatchObject({
      adminId: admin.id,
      action: 'UPDATE_SETTING',
      details: { welcomeBonusCap: 200, referralPercent: 20, referralBonusCap: 250, dailyBonus: 0 },
    })
  })

  it('rejects negative or missing bonuses and changes nothing', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await expect(
      setBonuses(admin.id, {
        welcomeBonusCap: '1',
        referralPercent: '101',
        referralBonusCap: '1',
        dailyBonus: '1',
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      setBonuses(admin.id, { welcomeBonusCap: '1', referralPercent: '1', referralBonusCap: '1' }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await prisma.setting.count()).toBe(0)
  })

  it('stores last sync time', async () => {
    expect(await getLastSyncAt()).toBeNull()
    const at = new Date('2026-11-11T10:00:00Z')
    await setLastSyncAt(at)
    expect(await getLastSyncAt()).toEqual(at)
  })
})
