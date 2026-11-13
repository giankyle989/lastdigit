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
import { setBonuses } from '@/server/settings'
import { registerPlayer, verifyCredentials } from '@/server/users'

import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('admin player management', () => {
  beforeEach(resetDb)

  it('grants points with a note and audits it', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await setBonuses(admin.id, {
      welcomeBonusCap: 0,
      referralPercent: 50,
      referralBonusCap: 500,
      dailyBonus: 0,
    })
    expect(
      await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: '1000', note: 'Welcome' }),
    ).toEqual({
      welcomeBonus: 0,
      referralBonus: 0,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(1000)
    expect(await prisma.transaction.findFirstOrThrow()).toMatchObject({
      type: 'ADMIN_GRANT',
      amount: 1000,
      adminId: admin.id,
      note: 'Welcome',
    })
    expect(await prisma.adminAction.findFirstOrThrow({ where: { action: 'GRANT_POINTS' } })).toMatchObject({
      action: 'GRANT_POINTS',
      targetUserId: p.id,
    })
    await expectLedgerConsistent()
  })

  it('matches the first top-up 1:1 as a welcome bonus, up to the cap, once', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const small = await makeUser()
    const big = await makeUser()
    expect(
      await adjustPoints(admin.id, small.id, { direction: 'GRANT', amount: 300, note: 'top-up' }),
    ).toEqual({
      welcomeBonus: 300,
      referralBonus: 0,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: small.id } })).balance).toBe(600)
    const bonus = await prisma.transaction.findFirstOrThrow({
      where: { userId: small.id, type: 'SIGNUP_BONUS' },
    })
    expect(bonus).toMatchObject({
      amount: 300,
      adminId: admin.id,
      note: 'Welcome bonus: first top-up matched',
    })

    // a second top-up is not matched
    expect(
      await adjustPoints(admin.id, small.id, { direction: 'GRANT', amount: 300, note: 'again' }),
    ).toEqual({
      welcomeBonus: 0,
      referralBonus: 0,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: small.id } })).balance).toBe(900)

    // capped at 1000 by default
    await adjustPoints(admin.id, big.id, { direction: 'GRANT', amount: 2000, note: 'top-up' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: big.id } })).balance).toBe(3000)
    await expectLedgerConsistent()
  })

  it('concurrent first top-ups match only once', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await Promise.all([
      adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'a' }),
      adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'b' }),
    ])
    expect(await prisma.transaction.count({ where: { type: 'SIGNUP_BONUS' } })).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(300)
  })

  it("pays the referrer 50% of the referred friend's first top-up, capped at 500", async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const alice = await registerPlayer({ username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      username: 'bob',
      password: 'secret123',
      referralCode: alice.referralCode,
    })
    const cara = await registerPlayer({
      username: 'cara',
      password: 'secret123',
      referralCode: alice.referralCode,
    })

    expect(await adjustPoints(admin.id, bob.id, { direction: 'GRANT', amount: 300, note: 'top-up' })).toEqual(
      {
        welcomeBonus: 300,
        referralBonus: 150,
      },
    )
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).balance).toBe(150)
    expect(await prisma.transaction.findFirstOrThrow({ where: { type: 'REFERRAL_BONUS' } })).toMatchObject({
      userId: alice.id,
      amount: 150,
      adminId: admin.id,
      note: 'Referral: bob topped up 300',
    })
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).referralBonusPaidAt,
    ).not.toBeNull()

    // only the first top-up counts
    await adjustPoints(admin.id, bob.id, { direction: 'GRANT', amount: 1000, note: 'again' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).balance).toBe(150)

    // 50% of 2000 is capped at 500
    await adjustPoints(admin.id, cara.id, { direction: 'GRANT', amount: 2000, note: 'top-up' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).balance).toBe(650)
    await expectLedgerConsistent()
  })

  it('pays no referral bonus for players whose referrer was already paid under the old rule', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const alice = await registerPlayer({ username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      username: 'bob',
      password: 'secret123',
      referralCode: alice.referralCode,
    })
    await prisma.user.update({ where: { id: bob.id }, data: { referralBonusPaidAt: new Date() } })
    expect(await adjustPoints(admin.id, bob.id, { direction: 'GRANT', amount: 300, note: 'top-up' })).toEqual(
      {
        welcomeBonus: 300,
        referralBonus: 0,
      },
    )
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).balance).toBe(0)
  })

  it('pays nothing when the referral percent or cap is 0', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const alice = await registerPlayer({ username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      username: 'bob',
      password: 'secret123',
      referralCode: alice.referralCode,
    })
    await setBonuses(admin.id, {
      welcomeBonusCap: 1000,
      referralPercent: 0,
      referralBonusCap: 500,
      dailyBonus: 0,
    })
    await adjustPoints(admin.id, bob.id, { direction: 'GRANT', amount: 300, note: 'top-up' })
    expect(await prisma.transaction.count({ where: { type: 'REFERRAL_BONUS' } })).toBe(0)
  })

  it('deducts points but not below zero', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'x' }) // +100 match
    await adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 40, note: 'correction' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(160)
    await expect(
      adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 161, note: 'too much' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
  })

  it('requires a note', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await expect(
      adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 1, note: '  ' }),
    ).rejects.toBeInstanceOf(ZodError)
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
