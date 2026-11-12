import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { getBonus, getBonuses, getLastSyncAt, setBonuses, setLastSyncAt } from '@/server/settings'

import { makeUser, resetDb } from '../helpers/db'

describe('settings', () => {
  beforeEach(resetDb)

  it('bonuses have defaults', async () => {
    expect(await getBonuses()).toEqual({ signupBonus: 1000, referralBonus: 500, dailyBonus: 100 })
    expect(await getBonus('referralBonus')).toBe(500)
  })

  it('admin can change the bonuses, and it is audited', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await setBonuses(admin.id, { signupBonus: '200', referralBonus: '250', dailyBonus: '0' })
    expect(await getBonuses()).toEqual({ signupBonus: 200, referralBonus: 250, dailyBonus: 0 })
    const log = await prisma.adminAction.findFirstOrThrow()
    expect(log).toMatchObject({
      adminId: admin.id,
      action: 'UPDATE_SETTING',
      details: { signupBonus: 200, referralBonus: 250, dailyBonus: 0 },
    })
  })

  it('rejects negative or missing bonuses and changes nothing', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await expect(
      setBonuses(admin.id, { signupBonus: '1', referralBonus: '-1', dailyBonus: '1' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(setBonuses(admin.id, { signupBonus: '1', referralBonus: '1' })).rejects.toBeInstanceOf(
      ZodError,
    )
    expect(await prisma.setting.count()).toBe(0)
  })

  it('stores last sync time', async () => {
    expect(await getLastSyncAt()).toBeNull()
    const at = new Date('2026-11-11T10:00:00Z')
    await setLastSyncAt(at)
    expect(await getLastSyncAt()).toEqual(at)
  })
})
