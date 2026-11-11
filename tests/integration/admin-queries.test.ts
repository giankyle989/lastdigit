import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { getDashboardStats, listTransactionsAdmin, searchPlayers } from '@/server/admin/queries'
import { postEntry } from '@/server/ledger'
import { setLastSyncAt } from '@/server/settings'
import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('admin queries', () => {
  beforeEach(resetDb)

  it('computes dashboard stats', async () => {
    await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ username: 'neg' })
    await makeUser({ username: 'ok' })
    await prisma.$transaction((tx) => postEntry(tx, { userId: p.id, type: 'REFUND', amount: -50 }))
    await makeGame({ status: 'SETTLED', pool: 1000, houseTake: 100 })
    await makeGame({ status: 'SETTLED', pool: 500, houseTake: 500 })
    await makeGame({ status: 'SCHEDULED', pool: 300 })
    await makeGame({ status: 'POSTPONED' })
    const now = new Date('2026-11-11T12:00:00Z')
    await setLastSyncAt(new Date('2026-11-11T11:00:00Z'))

    const s = await getDashboardStats(now)
    expect(s).toMatchObject({
      playerCount: 2,
      openPoolCount: 1,
      openPoolTotal: 300,
      houseTakeTotal: 600,
      openInquiries: 0,
      postponedCount: 1,
      syncStale: true,
    })
    expect(s.negativeBalances).toEqual([{ id: p.id, username: 'neg', balance: -50 }])
  })

  it('reports sync as fresh within 30 minutes', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    await setLastSyncAt(new Date('2026-11-11T11:45:00Z'))
    expect((await getDashboardStats(now)).syncStale).toBe(false)
  })

  it('searches players case-insensitively and filters transactions', async () => {
    const kyle = await makeUser({ username: 'Kyle' })
    await makeUser({ username: 'bob' })
    await makeUser({ username: 'boss', role: 'ADMIN' })
    expect((await searchPlayers('KY')).map((u) => u.username)).toEqual(['Kyle'])
    await fundUser(kyle.id, 10)
    const txs = await listTransactionsAdmin({ username: 'KYLE', type: 'ADMIN_GRANT' })
    expect(txs).toHaveLength(1)
    expect(txs[0].user.username).toBe('Kyle')
  })
})
