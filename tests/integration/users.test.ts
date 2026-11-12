import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { setBonuses } from '@/server/settings'
import { registerPlayer, verifyCredentials } from '@/server/users'

import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('registerPlayer', () => {
  beforeEach(resetDb)

  it('creates a player with hashed password, lowercase key and referral code', async () => {
    const u = await registerPlayer({ username: ' Kyle_1 ', password: 'secret123' })
    expect(u.username).toBe('Kyle_1')
    expect(u.usernameKey).toBe('kyle_1')
    expect(u.role).toBe('PLAYER')
    expect(u.passwordHash).not.toContain('secret123')
    expect(u.referralCode).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('rejects a username that differs only by case or whitespace', async () => {
    await registerPlayer({ username: 'kyle', password: 'secret123' })
    await expect(registerPlayer({ username: ' Kyle ', password: 'secret123' })).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    })
  })

  it.each(['ab', 'bad name!', 'x'.repeat(21)])('rejects invalid username %s', async (username) => {
    await expect(registerPlayer({ username, password: 'secret123' })).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects short passwords', async () => {
    await expect(registerPlayer({ username: 'kyle', password: 'short' })).rejects.toBeInstanceOf(ZodError)
  })

  it('gives every new player the signup bonus', async () => {
    const u = await registerPlayer({ username: 'kyle', password: 'secret123' })
    expect(u.balance).toBe(1000)
    const t = await prisma.transaction.findFirstOrThrow({ where: { userId: u.id } })
    expect(t).toMatchObject({ type: 'SIGNUP_BONUS', amount: 1000, note: 'Welcome bonus' })
    await expectLedgerConsistent()
  })

  it('links the referrer (case/space-insensitive code) but does not pay them at signup', async () => {
    const referrer = await registerPlayer({ username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      username: 'bob',
      password: 'secret123',
      referralCode: `  ${referrer.referralCode.toLowerCase()} `,
    })
    expect(bob.referredById).toBe(referrer.id)
    expect(bob.referralBonusPaidAt).toBeNull()
    expect(bob.balance).toBe(1000)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })
    expect(after.balance).toBe(1000) // only her own signup bonus
    expect(await prisma.transaction.count({ where: { type: 'REFERRAL_BONUS' } })).toBe(0)
    await expectLedgerConsistent()
  })

  it('rejects an unknown referral code and creates nothing', async () => {
    await expect(
      registerPlayer({ username: 'bob', password: 'secret123', referralCode: 'NOPE2345' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERRAL' })
    expect(await prisma.user.count()).toBe(0)
  })

  it('treats an empty referral code as none', async () => {
    const u = await registerPlayer({ username: 'bob', password: 'secret123', referralCode: '  ' })
    expect(u.referredById).toBeNull()
  })

  it('writes no bonus transaction when the signup bonus is 0', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await setBonuses(admin.id, { signupBonus: 0, referralBonus: 500, dailyBonus: 100 })
    const u = await registerPlayer({ username: 'alice', password: 'secret123' })
    expect(u.balance).toBe(0)
    expect(await prisma.transaction.count()).toBe(0)
  })
})

describe('verifyCredentials', () => {
  beforeEach(resetDb)

  it('returns the user for correct credentials, any username case', async () => {
    await registerPlayer({ username: 'Kyle', password: 'secret123' })
    expect((await verifyCredentials('KYLE', 'secret123'))?.username).toBe('Kyle')
  })

  it('returns null for wrong password or unknown user', async () => {
    await registerPlayer({ username: 'kyle', password: 'secret123' })
    expect(await verifyCredentials('kyle', 'wrongpass')).toBeNull()
    expect(await verifyCredentials('nobody', 'secret123')).toBeNull()
  })

  it('returns null while suspended, and the user after suspension expires', async () => {
    const u = await registerPlayer({ username: 'kyle', password: 'secret123' })
    await prisma.user.update({
      where: { id: u.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2026-11-12T00:00:00Z') },
    })
    expect(await verifyCredentials('kyle', 'secret123', new Date('2026-11-11T00:00:00Z'))).toBeNull()
    expect(await verifyCredentials('kyle', 'secret123', new Date('2026-11-13T00:00:00Z'))).not.toBeNull()
  })
})
