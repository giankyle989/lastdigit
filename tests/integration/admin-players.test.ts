import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import {
  adjustPoints,
  resetPassword,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { registerPlayer, verifyCredentials } from '@/server/users'
import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('admin player management', () => {
  beforeEach(resetDb)

  it('grants points with a note and audits it', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: '1000', note: 'Welcome' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(1000)
    expect(await prisma.transaction.findFirstOrThrow()).toMatchObject({
      type: 'ADMIN_GRANT',
      amount: 1000,
      adminId: admin.id,
      note: 'Welcome',
    })
    expect(await prisma.adminAction.findFirstOrThrow()).toMatchObject({ action: 'GRANT_POINTS', targetUserId: p.id })
    await expectLedgerConsistent()
  })

  it('deducts points but not below zero', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'x' })
    await adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 40, note: 'correction' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(60)
    await expect(
      adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 61, note: 'too much' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
  })

  it('requires a note', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await expect(adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 1, note: '  ' })).rejects.toBeInstanceOf(
      ZodError,
    )
  })

  it('only targets players', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const other = await makeUser({ role: 'ADMIN' })
    await expect(
      adjustPoints(admin.id, other.id, { direction: 'GRANT', amount: 1, note: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('suspends indefinitely, blocks login, and unsuspends', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await registerPlayer({ username: 'kyle', password: 'secret123' })
    await suspendPlayer(admin.id, p.id, null)
    expect(await verifyCredentials('kyle', 'secret123')).toBeNull()
    await unsuspendPlayer(admin.id, p.id)
    expect(await verifyCredentials('kyle', 'secret123')).not.toBeNull()
    const actions = await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['SUSPEND', 'UNSUSPEND'])
  })

  it('rejects a suspension end date in the past', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    const now = new Date('2026-11-11T00:00:00Z')
    await expect(suspendPlayer(admin.id, p.id, new Date('2026-11-10T00:00:00Z'), now)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('sets and clears the stake limit', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await setStakeLimit(admin.id, p.id, '500')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).stakeLimitPerGame).toBe(500)
    await setStakeLimit(admin.id, p.id, null)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).stakeLimitPerGame).toBeNull()
    await expect(setStakeLimit(admin.id, p.id, '0')).rejects.toBeInstanceOf(ZodError)
  })

  it('resets the password', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await registerPlayer({ username: 'kyle', password: 'secret123' })
    await resetPassword(admin.id, p.id, 'newpass123')
    expect(await verifyCredentials('kyle', 'secret123')).toBeNull()
    expect(await verifyCredentials('kyle', 'newpass123')).not.toBeNull()
    const log = await prisma.adminAction.findFirstOrThrow({ where: { action: 'RESET_PASSWORD' } })
    expect(JSON.stringify(log.details)).not.toContain('newpass123')
  })
})
