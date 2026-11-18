import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import {
  adjustPoints,
  confirmPhone,
  resetPassword,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { setBonuses } from '@/server/settings'
import { voidGame } from '@/server/settlement'

import { makeGame, makeUser, resetDb } from '../helpers/db'

const BONUSES = { welcomeBonusCap: 1000, referralPercent: 50, referralBonusCap: 200, dailyBonus: 0 }
const forbidden = { code: 'FORBIDDEN' }

describe('server permission checks', () => {
  beforeEach(resetDb)

  it('a manager can do player and points work', async () => {
    const manager = await makeUser({ role: 'MANAGER' })
    const player = await makeUser()
    await adjustPoints(manager.id, player.id, { direction: 'GRANT', amount: 100, note: 'cash in' })
    await adjustPoints(manager.id, player.id, { direction: 'DEDUCT', amount: 40, note: 'cash out' })
    await setStakeLimit(manager.id, player.id, 500)
    await suspendPlayer(manager.id, player.id, null)
    await unsuspendPlayer(manager.id, player.id)
    await resetPassword(manager.id, player.id, 'newpass123')
    // grant, deduct, stake limit, suspend, unsuspend, reset password (bonuses may add ledger rows)
    expect(await prisma.adminAction.count({ where: { adminId: manager.id } })).toBe(6)
  })

  it('a manager cannot void games or change bonuses, and nothing changes', async () => {
    const manager = await makeUser({ role: 'MANAGER' })
    const game = await makeGame()
    await expect(voidGame(manager.id, game.id, 'test')).rejects.toMatchObject(forbidden)
    await expect(setBonuses(manager.id, BONUSES)).rejects.toMatchObject(forbidden)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('SCHEDULED')
    expect(await prisma.adminAction.count()).toBe(0)
  })

  it('a superadmin can void games and change bonuses', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const game = await makeGame()
    await voidGame(boss.id, game.id, 'test')
    await setBonuses(boss.id, BONUSES)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('VOID')
  })

  it('a player id is refused for every staff job before any write', async () => {
    const actor = await makeUser()
    const target = await makeUser({ phoneConfirmedAt: null })
    await expect(
      adjustPoints(actor.id, target.id, { direction: 'GRANT', amount: 100, note: 'x' }),
    ).rejects.toMatchObject(forbidden)
    await expect(confirmPhone(actor.id, target.id)).rejects.toMatchObject(forbidden)
    await expect(suspendPlayer(actor.id, target.id, null)).rejects.toMatchObject(forbidden)
    expect(await prisma.adminAction.count()).toBe(0)
  })

  it('a suspended manager is refused', async () => {
    const manager = await makeUser({ role: 'MANAGER', status: 'SUSPENDED' })
    const player = await makeUser()
    await expect(
      adjustPoints(manager.id, player.id, { direction: 'GRANT', amount: 100, note: 'x' }),
    ).rejects.toMatchObject(forbidden)
  })
})
