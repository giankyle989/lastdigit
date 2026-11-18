import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { isSuspended } from '@/lib/suspension'
import { verifyPassword } from '@/server/passwords'
import { createManager, listStaff, resetStaffPassword, setStaffDisabled } from '@/server/staff'

import { makeUser, resetDb } from '../helpers/db'

const forbidden = { code: 'FORBIDDEN' }

describe('staff', () => {
  beforeEach(resetDb)

  it('a superadmin creates a manager who can log in', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const m = await createManager(boss.id, { username: 'Mila', password: 'temppass1' })
    expect(m.role).toBe('MANAGER')
    expect(m.phone).toBeNull()
    expect(await verifyPassword('temppass1', m.passwordHash)).toBe(true)
    const audit = await prisma.adminAction.findFirstOrThrow({ where: { action: 'CREATE_STAFF' } })
    expect(audit).toMatchObject({ adminId: boss.id, targetUserId: m.id })
  })

  it('refuses a taken username and bad input', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    await makeUser({ username: 'mila' })
    await expect(createManager(boss.id, { username: 'MILA', password: 'temppass1' })).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    })
    await expect(createManager(boss.id, { username: 'x', password: 'temppass1' })).rejects.toThrow()
    await expect(createManager(boss.id, { username: 'okname', password: 'short' })).rejects.toThrow()
  })

  it('disable signs the manager out; enable restores them', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const m = await makeUser({ role: 'MANAGER' })
    await setStaffDisabled(boss.id, m.id, true)
    expect(isSuspended(await prisma.user.findUniqueOrThrow({ where: { id: m.id } }))).toBe(true)
    await setStaffDisabled(boss.id, m.id, false)
    expect(isSuspended(await prisma.user.findUniqueOrThrow({ where: { id: m.id } }))).toBe(false)
    const actions = (await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (a) => a.action,
    )
    expect(actions).toEqual(['DISABLE_STAFF', 'ENABLE_STAFF'])
  })

  it('resets a manager password without logging it', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const m = await makeUser({ role: 'MANAGER' })
    await resetStaffPassword(boss.id, m.id, 'brandnew12')
    expect(
      await verifyPassword(
        'brandnew12',
        (await prisma.user.findUniqueOrThrow({ where: { id: m.id } })).passwordHash,
      ),
    ).toBe(true)
    const audit = await prisma.adminAction.findFirstOrThrow({ where: { action: 'RESET_STAFF_PASSWORD' } })
    expect(JSON.stringify(audit.details)).not.toContain('brandnew12')
  })

  it('never touches a superadmin, itself or a player', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const other = await makeUser({ role: 'SUPERADMIN' })
    const player = await makeUser()
    for (const target of [boss, other, player]) {
      await expect(setStaffDisabled(boss.id, target.id, true)).rejects.toMatchObject(forbidden)
      await expect(resetStaffPassword(boss.id, target.id, 'brandnew12')).rejects.toMatchObject(forbidden)
    }
    expect(await prisma.adminAction.count()).toBe(0)
  })

  it('managers cannot use any staff function', async () => {
    const m = await makeUser({ role: 'MANAGER' })
    const m2 = await makeUser({ role: 'MANAGER' })
    await expect(listStaff(m.id)).rejects.toMatchObject(forbidden)
    await expect(createManager(m.id, { username: 'sneaky', password: 'temppass1' })).rejects.toMatchObject(
      forbidden,
    )
    await expect(setStaffDisabled(m.id, m2.id, true)).rejects.toMatchObject(forbidden)
    await expect(resetStaffPassword(m.id, m2.id, 'brandnew12')).rejects.toMatchObject(forbidden)
  })

  it('lists staff only, with status and last seen', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN', username: 'boss' })
    const m = await makeUser({ role: 'MANAGER', username: 'mila', status: 'SUSPENDED' })
    await makeUser({ username: 'player1' })
    const seen = new Date('2026-11-18T01:00:00Z')
    await prisma.accountSighting.create({
      data: { userId: m.id, kind: 'DEVICE', fingerprint: 'f', firstSeenAt: seen, lastSeenAt: seen },
    })
    expect(await listStaff(boss.id)).toEqual([
      { id: boss.id, username: 'boss', role: 'SUPERADMIN', disabled: false, lastSeenAt: null },
      { id: m.id, username: 'mila', role: 'MANAGER', disabled: true, lastSeenAt: seen },
    ])
  })
})
