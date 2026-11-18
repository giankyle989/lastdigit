import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { registerPlayer, verifyCredentials } from '@/server/users'

import { expectLedgerConsistent, makeUser, nextPhone, resetDb } from '../helpers/db'

describe('registerPlayer', () => {
  beforeEach(resetDb)

  it.each(['MANAGER', 'SUPERADMIN'] as const)('rejects a %s referral code', async (role) => {
    const staff = await makeUser({ role })
    await expect(
      registerPlayer({
        username: `ref_${role}`,
        password: 'secret123',
        phone: '0917 555 0101',
        referralCode: staff.referralCode,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERRAL' })
  })

  it('creates a player with hashed password, lowercase key and referral code', async () => {
    const u = await registerPlayer({ phone: nextPhone(), username: ' Kyle_1 ', password: 'secret123' })
    expect(u.username).toBe('Kyle_1')
    expect(u.usernameKey).toBe('kyle_1')
    expect(u.role).toBe('PLAYER')
    expect(u.passwordHash).not.toContain('secret123')
    expect(u.referralCode).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('rejects a username that differs only by case or whitespace', async () => {
    await registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'secret123' })
    await expect(
      registerPlayer({ phone: nextPhone(), username: ' Kyle ', password: 'secret123' }),
    ).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    })
  })

  it.each(['ab', 'bad name!', 'x'.repeat(21)])('rejects invalid username %s', async (username) => {
    await expect(
      registerPlayer({ phone: nextPhone(), username, password: 'secret123' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects short passwords', async () => {
    await expect(
      registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'short' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('new players start at 0 with no transactions (the welcome bonus comes with the first top-up)', async () => {
    const u = await registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'secret123' })
    expect(u.balance).toBe(0)
    expect(await prisma.transaction.count()).toBe(0)
  })

  it('links the referrer (case/space-insensitive code) but does not pay them at signup', async () => {
    const referrer = await registerPlayer({ phone: nextPhone(), username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      phone: nextPhone(),
      username: 'bob',
      password: 'secret123',
      referralCode: `  ${referrer.referralCode.toLowerCase()} `,
    })
    expect(bob.referredById).toBe(referrer.id)
    expect(bob.referralBonusPaidAt).toBeNull()
    expect(bob.balance).toBe(0)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })
    expect(after.balance).toBe(0)
    expect(await prisma.transaction.count({ where: { type: 'REFERRAL_BONUS' } })).toBe(0)
    await expectLedgerConsistent()
  })

  it('rejects an unknown referral code and creates nothing', async () => {
    await expect(
      registerPlayer({
        phone: nextPhone(),
        username: 'bob',
        password: 'secret123',
        referralCode: 'NOPE2345',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERRAL' })
    expect(await prisma.user.count()).toBe(0)
  })

  it('treats an empty referral code as none', async () => {
    const u = await registerPlayer({
      phone: nextPhone(),
      username: 'bob',
      password: 'secret123',
      referralCode: '  ',
    })
    expect(u.referredById).toBeNull()
  })
})

describe('verifyCredentials', () => {
  beforeEach(resetDb)

  it('returns the user for correct credentials, any username case', async () => {
    await registerPlayer({ phone: nextPhone(), username: 'Kyle', password: 'secret123' })
    expect((await verifyCredentials('KYLE', 'secret123'))?.username).toBe('Kyle')
  })

  it('returns null for wrong password or unknown user', async () => {
    await registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'secret123' })
    expect(await verifyCredentials('kyle', 'wrongpass')).toBeNull()
    expect(await verifyCredentials('nobody', 'secret123')).toBeNull()
  })

  it('returns null while suspended, and the user after suspension expires', async () => {
    const u = await registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'secret123' })
    await prisma.user.update({
      where: { id: u.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2026-11-12T00:00:00Z') },
    })
    expect(await verifyCredentials('kyle', 'secret123', new Date('2026-11-11T00:00:00Z'))).toBeNull()
    expect(await verifyCredentials('kyle', 'secret123', new Date('2026-11-13T00:00:00Z'))).not.toBeNull()
  })

  it('stores the phone number in E.164', async () => {
    const u = await registerPlayer({ username: 'pia', password: 'secret123', phone: '0917 123 4567' })
    expect(u.phone).toBe('+639171234567')
    expect(u.phoneConfirmedAt).toBeNull()
  })

  it('requires a valid PH mobile number', async () => {
    await expect(registerPlayer({ username: 'pia', password: 'secret123' })).rejects.toBeInstanceOf(ZodError)
    await expect(
      registerPlayer({ username: 'pia', password: 'secret123', phone: '0281234567' }),
    ).rejects.toMatchObject({ issues: [{ message: 'Enter a PH mobile number, e.g. 0917 123 4567' }] })
    expect(await prisma.user.count()).toBe(0)
  })

  it('refuses the same number in another spelling', async () => {
    await registerPlayer({ username: 'pia', password: 'secret123', phone: '0917-123-4567' })
    await expect(
      registerPlayer({ username: 'quin', password: 'secret123', phone: '+639171234567' }),
    ).rejects.toMatchObject({ code: 'PHONE_TAKEN', message: 'This number is already registered.' })
  })

  it('lets only one of two racing signups take a number', async () => {
    const results = await Promise.allSettled([
      registerPlayer({ username: 'pia', password: 'secret123', phone: '09171234567' }),
      registerPlayer({ username: 'quin', password: 'secret123', phone: '09171234567' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'PHONE_TAKEN' },
    })
    expect(await prisma.user.count({ where: { phone: '+639171234567' } })).toBe(1)
  })
})
