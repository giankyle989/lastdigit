import { beforeEach, describe, expect, it } from 'vitest'

import { recordLoginSighting, recordSighting, signupAllowed } from '@/server/sightings'

import { makeUser, resetDb } from '../helpers/db'

const NOW = new Date('2026-11-20T03:00:00Z')
const MIN = 60_000

/** A player who signed up `minutesAgo` minutes before NOW on this network. */
async function signedUp(ip: string, minutesAgo: number) {
  const at = new Date(NOW.getTime() - minutesAgo * MIN)
  const u = await makeUser({ createdAt: at })
  await recordSighting(u.id, { deviceId: null, ip }, at)
  return u
}

// The limit lives in the database (not process memory), so it holds across server instances and
// restarts such as Cloud Run scaling to zero.
describe('signup limit per network', () => {
  beforeEach(resetDb)

  it('allows signups until the hourly limit is reached', async () => {
    await signedUp('203.0.113.7', 10)
    await signedUp('203.0.113.7', 50)
    expect(await signupAllowed('203.0.113.7', 3, NOW)).toBe(true)
    await signedUp('203.0.113.7', 1)
    expect(await signupAllowed('203.0.113.7', 3, NOW)).toBe(false)
    // another network is unaffected
    expect(await signupAllowed('198.51.100.9', 3, NOW)).toBe(true)
  })

  it('forgets signups older than an hour', async () => {
    await signedUp('203.0.113.7', 61)
    await signedUp('203.0.113.7', 90)
    expect(await signupAllowed('203.0.113.7', 1, NOW)).toBe(true)
  })

  it('does not count logins from the network by older accounts', async () => {
    const old = await makeUser({ createdAt: new Date(NOW.getTime() - 48 * 60 * MIN) })
    await recordLoginSighting(old.username, { deviceId: null, ip: '203.0.113.7' })
    expect(await signupAllowed('203.0.113.7', 1, NOW)).toBe(true)
  })

  it('never blocks when the network is unknown', async () => {
    expect(await signupAllowed('unknown', 1, NOW)).toBe(true)
  })
})
