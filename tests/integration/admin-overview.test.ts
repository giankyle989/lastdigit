import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { getAdminBadges, getDailyVolume, getOverviewStats, getTopBettorsToday } from '@/server/admin/overview'
import { postEntry } from '@/server/ledger'
import { setLastSyncAt } from '@/server/settings'

import { makeGame, makeUser, resetDb } from '../helpers/db'

/** A BET ledger row of `stake` points created at `at`. */
async function betAt(userId: string, stake: number, at: Date) {
  const t = await prisma.$transaction((tx) => postEntry(tx, { userId, type: 'BET', amount: -stake }))
  await prisma.transaction.update({ where: { id: t.id }, data: { createdAt: at } })
}

describe('admin overview', () => {
  beforeEach(resetDb)

  it('buckets BET volume and house take by ET day', async () => {
    const u = await makeUser()
    const now = new Date('2026-11-11T17:00:00Z') // Nov 11 ET
    await betAt(u.id, 100, new Date('2026-11-11T04:59:59Z')) // 23:59:59 ET Nov 10
    await betAt(u.id, 40, new Date('2026-11-11T05:00:00Z')) // 00:00 ET Nov 11
    await betAt(u.id, 60, new Date('2026-11-11T16:00:00Z'))
    await betAt(u.id, 999, new Date('2026-10-01T16:00:00Z')) // outside the window
    await prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount: 500 }))
    await makeGame({ status: 'SETTLED', houseTake: 30, settledAt: new Date('2026-11-11T03:00:00Z') }) // Nov 10 ET
    await makeGame({ status: 'SETTLED', houseTake: 12, settledAt: new Date('2026-11-11T12:00:00Z') })
    await makeGame({ status: 'FINAL', houseTake: 0 })

    const points = await getDailyVolume(14, now)
    expect(points).toHaveLength(14)
    expect(points[0]?.date).toBe('2026-10-29')
    expect(points.at(-1)).toEqual({ date: '2026-11-11', volume: 100, houseTake: 12 })
    expect(points.at(-2)).toEqual({ date: '2026-11-10', volume: 100, houseTake: 30 })
    expect(points.slice(0, -2).every((p) => p.volume === 0 && p.houseTake === 0)).toBe(true)
  })

  it('ranks today’s top bettors by BET volume in the ET day', async () => {
    const now = new Date('2026-11-12T03:00:00Z') // 22:00 ET Nov 11
    const users = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => makeUser({ username: `tb_${n}` })),
    )
    const stakes = [10, 70, 30, 50, 20, 60]
    for (const [i, u] of users.entries()) await betAt(u.id, stakes[i] ?? 0, new Date('2026-11-11T20:00:00Z'))
    const first = users[0]
    if (!first) throw new Error('setup')
    await betAt(first.id, 500, new Date('2026-11-11T04:00:00Z')) // Nov 10 ET: not today

    expect(await getTopBettorsToday(now)).toEqual([
      { userId: users[1]?.id, username: 'tb_b', volume: 70 },
      { userId: users[5]?.id, username: 'tb_f', volume: 60 },
      { userId: users[3]?.id, username: 'tb_d', volume: 50 },
      { userId: users[2]?.id, username: 'tb_c', volume: 30 },
      { userId: users[4]?.id, username: 'tb_e', volume: 20 },
    ])
  })

  it('computes KPI stats and needs-attention lists', async () => {
    const now = new Date('2026-11-11T17:00:00Z')
    await makeUser({ role: 'ADMIN' })
    const neg = await makeUser({ username: 'neg' })
    await makeUser({ username: 'old', createdAt: new Date('2026-10-01T00:00:00Z') })
    await prisma.$transaction((tx) => postEntry(tx, { userId: neg.id, type: 'REFUND', amount: -50 }))
    await makeGame({ status: 'SETTLED', houseTake: 100, settledAt: new Date('2026-11-05T12:00:00Z') }) // in 7 ET days
    await makeGame({ status: 'SETTLED', houseTake: 500, settledAt: new Date('2026-11-01T12:00:00Z') }) // older
    await makeGame({ status: 'SCHEDULED', pool: 300 })
    const pp = await makeGame({ status: 'POSTPONED', awayTeam: 'BOS', homeTeam: 'NYK' })
    const ticket = await prisma.inquiry.create({ data: { userId: neg.id, subject: 'Help' } })
    await setLastSyncAt(new Date('2026-11-11T16:45:00Z'))

    const s = await getOverviewStats(now)
    expect(s).toMatchObject({
      playerCount: 2,
      newPlayers7d: 1,
      openPoolTotal: 300,
      openPoolCount: 1,
      houseTake7d: 100,
      houseTakeAllTime: 600,
      syncStale: false,
      openTicketCount: 1,
    })
    expect(s.postponed.map((g) => g.id)).toEqual([pp.id])
    expect(s.negativeBalances).toEqual([{ id: neg.id, username: 'neg', balance: -50 }])
    expect(s.openTickets).toEqual([{ id: ticket.id, subject: 'Help', username: 'neg' }])
    expect(await getAdminBadges()).toEqual({ openTickets: 1, needsAttention: true })
  })

  it('flags a stale or missing sync and reports all clear', async () => {
    const now = new Date('2026-11-11T17:00:00Z')
    expect((await getOverviewStats(now)).syncStale).toBe(true)
    await setLastSyncAt(new Date('2026-11-11T16:29:59Z'))
    expect((await getOverviewStats(now)).syncStale).toBe(true)
    expect(await getAdminBadges()).toEqual({ openTickets: 0, needsAttention: false })
  })
})
