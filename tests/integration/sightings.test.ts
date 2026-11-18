import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import {
  linkedAccounts,
  recordLoginSighting,
  recordSighting,
  sharedDevicePlayerIds,
} from '@/server/sightings'

import { makeUser, resetDb } from '../helpers/db'

const DEVICE_A = 'AAAAAAAAAAAAAAAAAAAAAA'
const DEVICE_B = 'BBBBBBBBBBBBBBBBBBBBBB'

describe('account sightings', () => {
  beforeEach(resetDb)

  it('stores hashed fingerprints and updates lastSeenAt', async () => {
    const u = await makeUser()
    const t1 = new Date('2026-11-18T01:00:00Z')
    const t2 = new Date('2026-11-18T02:00:00Z')
    await recordSighting(u.id, { deviceId: DEVICE_A, ip: '192.168.1.20' }, t1)
    await recordSighting(u.id, { deviceId: DEVICE_A, ip: '192.168.1.20' }, t2)
    const rows = await prisma.accountSighting.findMany({ orderBy: { kind: 'asc' } })
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/)
      expect(r.fingerprint).not.toContain('192.168')
      expect(r).toMatchObject({ firstSeenAt: t1, lastSeenAt: t2 })
    }
  })

  it('skips an unknown IP and a missing device', async () => {
    const u = await makeUser()
    await recordSighting(u.id, { deviceId: null, ip: 'unknown' })
    expect(await prisma.accountSighting.count()).toBe(0)
  })

  it('links players by device and by network, never admins or the player itself', async () => {
    const pia = await makeUser({ username: 'pia' })
    const quin = await makeUser({ username: 'quin' })
    const rae = await makeUser({ username: 'rae' })
    const admin = await makeUser({ role: 'SUPERADMIN' })
    await recordSighting(pia.id, { deviceId: DEVICE_A, ip: '10.0.0.1' })
    await recordSighting(quin.id, { deviceId: DEVICE_A, ip: '10.0.0.1' })
    await recordSighting(rae.id, { deviceId: DEVICE_B, ip: '10.0.0.1' })
    await recordSighting(admin.id, { deviceId: DEVICE_A, ip: '10.0.0.1' })

    expect(await linkedAccounts(pia.id)).toEqual([
      { id: quin.id, username: 'quin', sameDevice: true, sameNetwork: true },
      { id: rae.id, username: 'rae', sameDevice: false, sameNetwork: true },
    ])
    expect((await sharedDevicePlayerIds()).sort()).toEqual([pia.id, quin.id].sort())
  })

  it('records a login by username, case-insensitively', async () => {
    const u = await makeUser({ username: 'Pia' })
    await recordLoginSighting('pia', { deviceId: DEVICE_A, ip: '10.0.0.1' })
    expect(await prisma.accountSighting.count({ where: { userId: u.id } })).toBe(2)
    await recordLoginSighting('nobody', { deviceId: DEVICE_A, ip: '10.0.0.1' }) // no throw
  })
})
