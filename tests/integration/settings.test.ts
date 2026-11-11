import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { getLastSyncAt, getReferralBonus, setLastSyncAt, setReferralBonus } from '@/server/settings'
import { makeUser, resetDb } from '../helpers/db'

describe('settings', () => {
  beforeEach(resetDb)

  it('referral bonus defaults to 500', async () => {
    expect(await getReferralBonus()).toBe(500)
  })

  it('admin can change the referral bonus, and it is audited', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await setReferralBonus(admin.id, '250')
    expect(await getReferralBonus()).toBe(250)
    const log = await prisma.adminAction.findFirstOrThrow()
    expect(log).toMatchObject({ adminId: admin.id, action: 'UPDATE_SETTING' })
  })

  it('rejects negative bonus', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await expect(setReferralBonus(admin.id, '-1')).rejects.toBeInstanceOf(ZodError)
  })

  it('stores last sync time', async () => {
    expect(await getLastSyncAt()).toBeNull()
    const at = new Date('2026-11-11T10:00:00Z')
    await setLastSyncAt(at)
    expect(await getLastSyncAt()).toEqual(at)
  })
})
