import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { listAdminActions, parseAdminActionListParams } from '@/server/admin/tables/admin-actions'
import { listGames, parseGameListParams } from '@/server/admin/tables/games'
import { listLedger, parseLedgerListParams } from '@/server/admin/tables/ledger'
import { listPlayers, parsePlayerListParams } from '@/server/admin/tables/players'
import { listTickets, parseTicketListParams } from '@/server/admin/tables/tickets'
import { logAdminAction } from '@/server/audit'
import { postEntry } from '@/server/ledger'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('admin tables', () => {
  beforeEach(resetDb)

  it('players: search, status filter, whitelisted sort, pagination', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const ref = await makeUser({ username: 'Referrer' })
    await makeUser({ username: 'kyle', referredById: ref.id })
    await makeUser({ username: 'kylie', status: 'SUSPENDED' })
    await makeUser({
      username: 'expired',
      status: 'SUSPENDED',
      suspendedUntil: new Date('2026-11-01T00:00:00Z'),
    })
    await makeUser({ username: 'boss', role: 'ADMIN' })
    await fundUser(ref.id, 50)

    const byName = await listPlayers(parsePlayerListParams({ q: 'KY', sort: 'username' }), now)
    expect(byName.rows.map((r) => r.username)).toEqual(['kyle', 'kylie'])
    const suspended = await listPlayers(parsePlayerListParams({ status: 'suspended' }), now)
    expect(suspended.rows.map((r) => r.username)).toEqual(['kylie'])
    const active = await listPlayers(parsePlayerListParams({ status: 'active', sort: 'username' }), now)
    expect(active.rows.map((r) => r.username)).toEqual(['expired', 'kyle', 'Referrer'])
    const byBalance = await listPlayers(parsePlayerListParams({ sort: '-balance' }), now)
    expect(byBalance.rows[0]?.username).toBe('Referrer')
    const byRefs = await listPlayers(parsePlayerListParams({ sort: '-referrals' }), now)
    expect(byRefs.rows[0]).toMatchObject({ username: 'Referrer', _count: { referrals: 1 } })
    // unknown sort → default -joined (newest first); bad page → 1
    const fallback = await listPlayers(parsePlayerListParams({ sort: 'passwordHash', page: 'x' }), now)
    expect(fallback.page).toBe(1)
    expect(fallback.rows[0]?.username).toBe('expired')
    expect(fallback.rows.map((r) => r.username)).not.toContain('boss')

    for (let i = 0; i < 26; i++) await makeUser({ username: `bulk${i}` })
    const p2 = await listPlayers(parsePlayerListParams({ q: 'bulk', page: '2' }), now)
    expect(p2).toMatchObject({ total: 26, page: 2, pageCount: 2 })
    expect(p2.rows).toHaveLength(1)
  })

  it('games: status and ET date-range filters, team search, sort', async () => {
    const a = await makeGame({ startsAt: new Date('2026-11-10T23:00:00Z'), pool: 50 }) // Nov 10 ET
    const b = await makeGame({ startsAt: new Date('2026-11-12T03:00:00Z'), pool: 500, awayTeam: 'BOS' }) // Nov 11 ET
    const c = await makeGame({ startsAt: new Date('2026-11-12T06:00:00Z'), status: 'POSTPONED' }) // Nov 12 ET

    expect((await listGames(parseGameListParams({}))).rows.map((g) => g.id)).toEqual([c.id, b.id, a.id])
    expect((await listGames(parseGameListParams({ sort: 'pool' }))).rows.map((g) => g.id)).toEqual([
      c.id,
      a.id,
      b.id,
    ])
    expect((await listGames(parseGameListParams({ status: 'POSTPONED' }))).rows.map((g) => g.id)).toEqual([
      c.id,
    ])
    expect(
      (await listGames(parseGameListParams({ from: '2026-11-11', to: '2026-11-11' }))).rows.map((g) => g.id),
    ).toEqual([b.id])
    expect((await listGames(parseGameListParams({ q: 'bos' }))).rows.map((g) => g.id)).toEqual([b.id])
    expect((await listGames(parseGameListParams({ status: 'bogus', from: 'junk' }))).total).toBe(3)
  })

  it('ledger: username/type filters, totals for the whole filter', async () => {
    const kyle = await makeUser({ username: 'Kyle' })
    const bob = await makeUser({ username: 'bob' })
    await fundUser(kyle.id, 10)
    await fundUser(kyle.id, 15)
    await fundUser(bob.id, 7)
    await prisma.$transaction((tx) => postEntry(tx, { userId: kyle.id, type: 'BET', amount: -5 }))

    const grants = await listLedger(parseLedgerListParams({ q: 'KYLE', type: 'ADMIN_GRANT' }))
    expect(grants).toMatchObject({ total: 2, totalAmount: 25 })
    expect(grants.rows.every((r) => r.user.username === 'Kyle')).toBe(true)
    const all = await listLedger(parseLedgerListParams({ sort: 'amount' }))
    expect(all.rows.map((r) => r.amount)).toEqual([-5, 7, 10, 15])
    expect(all.totalAmount).toBe(27)
    const none = await listLedger(parseLedgerListParams({ from: '2000-01-01', to: '2000-01-02' }))
    expect(none).toMatchObject({ total: 0, totalAmount: 0, rows: [] })
  })

  it('tickets: default OPEN tab, search by subject or username', async () => {
    const kyle = await makeUser({ username: 'kyle' })
    const bob = await makeUser({ username: 'bob' })
    const t1 = await prisma.inquiry.create({ data: { userId: kyle.id, subject: 'Missing payout' } })
    const t2 = await prisma.inquiry.create({ data: { userId: bob.id, subject: 'Hello' } })
    await prisma.inquiry.create({ data: { userId: bob.id, subject: 'Old', status: 'CLOSED' } })

    expect((await listTickets(parseTicketListParams({}))).rows.map((t) => t.id).sort()).toEqual(
      [t1.id, t2.id].sort(),
    )
    expect((await listTickets(parseTicketListParams({ q: 'PAYOUT' }))).rows.map((t) => t.id)).toEqual([t1.id])
    expect((await listTickets(parseTicketListParams({ q: 'bob' }))).rows.map((t) => t.id)).toEqual([t2.id])
    expect((await listTickets(parseTicketListParams({ status: 'CLOSED' }))).total).toBe(1)
    expect((await listTickets(parseTicketListParams({ status: 'nope' }))).total).toBe(2)
  })

  it('admin actions: filter by action type', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await prisma.$transaction(async (tx) => {
      await logAdminAction(tx, { adminId: admin.id, action: 'SUSPEND', targetUserId: p.id })
      await logAdminAction(tx, { adminId: admin.id, action: 'UPDATE_SETTING' })
    })
    expect((await listAdminActions(parseAdminActionListParams({}))).total).toBe(2)
    const suspends = await listAdminActions(parseAdminActionListParams({ action: 'SUSPEND' }))
    expect(suspends.rows.map((r) => [r.action, r.targetUser?.id])).toEqual([['SUSPEND', p.id]])
    expect((await listAdminActions(parseAdminActionListParams({ action: 'DROP' }))).total).toBe(2)
  })
})
