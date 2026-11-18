import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import {
  adjustBalance,
  confirmPhone,
  resetPassword,
  setPhone,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { setBonuses } from '@/server/settings'
import { registerPlayer, verifyCredentials } from '@/server/users'

import { expectLedgerConsistent, fundUser, makeUser, nextPhone, resetDb } from '../helpers/db'

describe('admin player management', () => {
  beforeEach(resetDb)

  async function balancesOf(id: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } })
    return { wallet: u.walletBalance, points: u.pointsBalance }
  }

  it('cashes in with a note and audits it with a note and audits it', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await setBonuses(admin.id, {
      welcomeBonusCap: 0,
      referralPercent: 50,
      referralBonusCap: 500,
      dailyBonus: 0,
    })
    expect(await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: '1000', note: 'Welcome' })).toEqual(
      {
        kind: 'CASH_IN',
        welcomeBonus: 0,
        referralBonus: 0,
      },
    )
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).walletBalance).toBe(1000)
    expect(await prisma.transaction.findFirstOrThrow()).toMatchObject({
      type: 'ADMIN_GRANT',
      amount: 1000,
      adminId: admin.id,
      note: 'Welcome',
    })
    expect(await prisma.adminAction.findFirstOrThrow({ where: { action: 'CASH_IN' } })).toMatchObject({
      action: 'CASH_IN',
      targetUserId: p.id,
    })
    await expectLedgerConsistent()
  })

  it('matches the first top-up 1:1 as a welcome bonus, up to the cap, once', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const small = await makeUser()
    const big = await makeUser()
    expect(await adjustBalance(admin.id, small.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual(
      {
        kind: 'CASH_IN',
        welcomeBonus: 300,
        referralBonus: 0,
      },
    )
    // 300 in the wallet, the 300 welcome match in points
    expect(await balancesOf(small.id)).toEqual({ wallet: 300, points: 300 })
    const bonus = await prisma.transaction.findFirstOrThrow({
      where: { userId: small.id, type: 'SIGNUP_BONUS' },
    })
    expect(bonus).toMatchObject({
      amount: 300,
      adminId: admin.id,
      note: 'Welcome bonus: first top-up matched',
    })

    // a second top-up is not matched
    expect(await adjustBalance(admin.id, small.id, { kind: 'CASH_IN', amount: 300, note: 'again' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 0,
      referralBonus: 0,
    })
    expect(await balancesOf(small.id)).toEqual({ wallet: 600, points: 300 })

    // capped at 1000 by default
    await adjustBalance(admin.id, big.id, { kind: 'CASH_IN', amount: 2000, note: 'top-up' })
    expect(await balancesOf(big.id)).toEqual({ wallet: 2000, points: 1000 })
    await expectLedgerConsistent()
  })

  it('concurrent first top-ups match only once', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await Promise.all([
      adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 100, note: 'a' }),
      adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 100, note: 'b' }),
    ])
    expect(await prisma.transaction.count({ where: { type: 'SIGNUP_BONUS' } })).toBe(1)
    expect(await balancesOf(p.id)).toEqual({ wallet: 200, points: 100 })
  })

  it("pays the referrer 50% of the referred friend's first top-up, capped at 200", async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const alice = await registerPlayer({ phone: nextPhone(), username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      phone: nextPhone(),
      username: 'bob',
      password: 'secret123',
      referralCode: alice.referralCode,
    })
    const cara = await registerPlayer({
      phone: nextPhone(),
      username: 'cara',
      password: 'secret123',
      referralCode: alice.referralCode,
    })

    await confirmPhone(admin.id, alice.id)
    await confirmPhone(admin.id, bob.id)
    expect(await adjustBalance(admin.id, bob.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 300,
      referralBonus: 150,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).pointsBalance).toBe(150)
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
    await adjustBalance(admin.id, bob.id, { kind: 'CASH_IN', amount: 1000, note: 'again' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).pointsBalance).toBe(150)

    // 50% of 2000 is capped at 200 (the default cap)
    await confirmPhone(admin.id, cara.id)
    await adjustBalance(admin.id, cara.id, { kind: 'CASH_IN', amount: 2000, note: 'top-up' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).pointsBalance).toBe(350)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).walletBalance).toBe(0)
    await expectLedgerConsistent()
  })

  it('pays no referral bonus for players whose referrer was already paid under the old rule', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const alice = await registerPlayer({ phone: nextPhone(), username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      phone: nextPhone(),
      username: 'bob',
      password: 'secret123',
      referralCode: alice.referralCode,
    })
    await prisma.user.update({ where: { id: bob.id }, data: { referralBonusPaidAt: new Date() } })
    await confirmPhone(admin.id, bob.id)
    expect(await adjustBalance(admin.id, bob.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 300,
      referralBonus: 0,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).pointsBalance).toBe(0)
  })

  it('pays no referral bonus to a referrer whose phone is not confirmed', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const alice = await registerPlayer({ phone: nextPhone(), username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      phone: nextPhone(),
      username: 'bob',
      password: 'secret123',
      referralCode: alice.referralCode,
    })
    await confirmPhone(admin.id, bob.id)
    expect(await adjustBalance(admin.id, bob.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 300,
      referralBonus: 0,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).pointsBalance).toBe(0)
    expect(await prisma.transaction.count({ where: { type: 'REFERRAL_BONUS' } })).toBe(0)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).referralBonusPaidAt).toBeNull()
  })

  it('pays nothing when the referral percent or cap is 0', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const alice = await registerPlayer({ phone: nextPhone(), username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      phone: nextPhone(),
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
    await confirmPhone(admin.id, bob.id)
    await adjustBalance(admin.id, bob.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })
    expect(await prisma.transaction.count({ where: { type: 'REFERRAL_BONUS' } })).toBe(0)
  })

  it('cashes out but not below zero', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 100, note: 'x' }) // +100 match in points
    await adjustBalance(admin.id, p.id, { kind: 'CASH_OUT', amount: 40, note: 'correction' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 60, points: 100 })
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'CASH_OUT', amount: 61, note: 'too much' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
  })

  it('requires a note', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 1, note: '  ' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('gives and takes points without touching the wallet, auditing each', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    expect(await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 300, note: 'promo' })).toEqual({
      kind: 'GIVE_POINTS',
      welcomeBonus: 0,
      referralBonus: 0,
    })
    await adjustBalance(admin.id, p.id, { kind: 'TAKE_POINTS', amount: 100, note: 'fix' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 200 })
    const actions = await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['GRANT_POINTS', 'DEDUCT_POINTS'])
    await expectLedgerConsistent()
  })

  it('giving points never triggers the welcome or referral bonus', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    await setBonuses(admin.id, {
      welcomeBonusCap: 1000,
      referralPercent: 50,
      referralBonusCap: 500,
      dailyBonus: 0,
    })
    const ref = await makeUser()
    const p = await makeUser({ referredById: ref.id })
    await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 400, note: 'promo' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 400 })
    expect(await balancesOf(ref.id)).toEqual({ wallet: 0, points: 0 })
    // the later first cash in still pays both bonuses, as points
    expect(await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 300,
      referralBonus: 150,
    })
    expect(await balancesOf(p.id)).toEqual({ wallet: 300, points: 700 })
    expect(await balancesOf(ref.id)).toEqual({ wallet: 0, points: 150 })
  })

  it('cash out cannot dip into points', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 500, note: 'promo' })
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'CASH_OUT', amount: 1, note: 'payout' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 500 })
  })

  it('cannot take more points than the player has', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 50, note: 'promo' })
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'TAKE_POINTS', amount: 51, note: 'fix' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough points' })
  })

  it('both grants need a confirmed phone; deductions do not', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phoneConfirmedAt: null })
    for (const kind of ['CASH_IN', 'GIVE_POINTS'] as const) {
      await expect(adjustBalance(admin.id, p.id, { kind, amount: 10, note: 'x' })).rejects.toMatchObject({
        code: 'PHONE_NOT_CONFIRMED',
      })
    }
    await fundUser(p.id, 20, 'POINTS')
    await adjustBalance(admin.id, p.id, { kind: 'TAKE_POINTS', amount: 20, note: 'fix' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 0 })
  })

  it('a player with a grant from before the split gets no second welcome bonus', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    await setBonuses(admin.id, {
      welcomeBonusCap: 1000,
      referralPercent: 0,
      referralBonusCap: 0,
      dailyBonus: 0,
    })
    const p = await makeUser()
    await fundUser(p.id, 100, 'WALLET') // an old ADMIN_GRANT row, now on WALLET
    expect(await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 0,
      referralBonus: 0,
    })
  })

  it('rejects an unknown kind', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'GRANT', amount: 10, note: 'x' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects a cash in above 10,000,000 points', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: '10000001', note: 'typo' }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await prisma.transaction.count()).toBe(0)
  })

  it('only targets players', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const other = await makeUser({ role: 'SUPERADMIN' })
    await expect(
      adjustBalance(admin.id, other.id, { kind: 'CASH_IN', amount: 1, note: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('suspends indefinitely, blocks login, and unsuspends', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'secret123' })
    await suspendPlayer(admin.id, p.id, null)
    expect(await verifyCredentials('kyle', 'secret123')).toBeNull()
    await unsuspendPlayer(admin.id, p.id)
    expect(await verifyCredentials('kyle', 'secret123')).not.toBeNull()
    const actions = await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['SUSPEND', 'UNSUSPEND'])
  })

  it('rejects a suspension end date in the past', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    const now = new Date('2026-11-11T00:00:00Z')
    await expect(suspendPlayer(admin.id, p.id, new Date('2026-11-10T00:00:00Z'), now)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('sets and clears the stake limit', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await setStakeLimit(admin.id, p.id, '500')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).stakeLimitPerGame).toBe(500)
    await setStakeLimit(admin.id, p.id, null)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).stakeLimitPerGame).toBeNull()
    await expect(setStakeLimit(admin.id, p.id, '0')).rejects.toBeInstanceOf(ZodError)
    await expect(setStakeLimit(admin.id, p.id, '1000001')).rejects.toBeInstanceOf(ZodError)
  })

  it('resets the password', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await registerPlayer({ phone: nextPhone(), username: 'kyle', password: 'secret123' })
    await resetPassword(admin.id, p.id, 'newpass123')
    expect(await verifyCredentials('kyle', 'secret123')).toBeNull()
    expect(await verifyCredentials('kyle', 'newpass123')).not.toBeNull()
    const log = await prisma.adminAction.findFirstOrThrow({ where: { action: 'RESET_PASSWORD' } })
    expect(JSON.stringify(log.details)).not.toContain('newpass123')
  })

  it('blocks cash in until the phone is confirmed, but always allows cash out', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phone: '+639171111111', phoneConfirmedAt: null })
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 100, note: 'top-up' }),
    ).rejects.toMatchObject({ code: 'PHONE_NOT_CONFIRMED', message: 'Confirm the phone number first' })
    expect(await prisma.transaction.count()).toBe(0)

    await confirmPhone(admin.id, p.id)
    await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 100, note: 'top-up' })
    await setPhone(admin.id, p.id, '0917 222 2222') // clears the confirmation
    await adjustBalance(admin.id, p.id, { kind: 'CASH_OUT', amount: 10, note: 'fix' })
    // 100 cashed in, 100 welcome match in points (default cap 1,000), 10 cashed out
    expect(await balancesOf(p.id)).toEqual({ wallet: 90, points: 100 })
  })

  it('confirms the phone once and audits it', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phone: '+639171111111', phoneConfirmedAt: null })
    const now = new Date('2026-11-18T03:00:00Z')
    await confirmPhone(admin.id, p.id, now)
    expect(await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      phoneConfirmedAt: now,
      phoneConfirmedById: admin.id,
    })
    expect(await prisma.adminAction.findFirstOrThrow({ where: { action: 'CONFIRM_PHONE' } })).toMatchObject({
      adminId: admin.id,
      targetUserId: p.id,
      details: { phone: '+639171111111' },
    })
  })

  it('cannot confirm a player without a number', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phone: null, phoneConfirmedAt: null })
    await expect(confirmPhone(admin.id, p.id)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Add a phone number first',
    })
  })

  it('edits the number, clears the confirmation and audits old and new', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phone: '+639171111111' })
    await setPhone(admin.id, p.id, '0917-222-2222')
    expect(await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      phone: '+639172222222',
      phoneConfirmedAt: null,
      phoneConfirmedById: null,
    })
    expect(await prisma.adminAction.findFirstOrThrow({ where: { action: 'UPDATE_PHONE' } })).toMatchObject({
      details: { from: '+639171111111', to: '+639172222222' },
    })
  })

  it('saving the same number keeps the confirmation', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phone: '+639171111111' })
    await setPhone(admin.id, p.id, '09171111111')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).phoneConfirmedAt).not.toBeNull()
    expect(await prisma.adminAction.count({ where: { action: 'UPDATE_PHONE' } })).toBe(0)
  })

  it("refuses another player's number and invalid input", async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const taken = nextPhone()
    await makeUser({ phone: taken })
    const p = await makeUser()
    await expect(setPhone(admin.id, p.id, taken)).rejects.toMatchObject({ code: 'PHONE_TAKEN' })
    await expect(setPhone(admin.id, p.id, '12345')).rejects.toBeInstanceOf(ZodError)
  })
})
