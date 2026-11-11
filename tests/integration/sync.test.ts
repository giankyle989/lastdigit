import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/cron/sync/route'
import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { getLastSyncAt } from '@/server/settings'
import { voidGame } from '@/server/settlement'
import type { ApiGame } from '@/server/sync/balldontlie'
import { syncGames } from '@/server/sync/sync'

import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

function apiGame(over: Partial<ApiGame> = {}): ApiGame {
  return {
    id: 501,
    date: '2026-11-11',
    datetime: '2026-11-12T00:00:00.000Z',
    status: '7:00 pm ET',
    period: 0,
    home_team_score: 0,
    visitor_team_score: 0,
    home_team: { abbreviation: 'GSW' },
    visitor_team: { abbreviation: 'LAL' },
    ...over,
  }
}
const fetcher = (games: ApiGame[]) => async () => games

describe('syncGames', () => {
  beforeEach(resetDb)

  it('creates new games and records the sync time', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const r = await syncGames({ fetchGames: fetcher([apiGame()]), now })
    expect(r).toMatchObject({ fetched: 1, created: 1 })
    expect(await prisma.game.findUniqueOrThrow({ where: { externalId: 501 } })).toMatchObject({
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    })
    expect(await getLastSyncAt()).toEqual(now)
  })

  it('updates scores and settles games that went final', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ externalId: 501 })
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    const r = await syncGames({
      fetchGames: fetcher([
        apiGame({ status: 'Final', period: 4, visitor_team_score: 99, home_team_score: 106 }),
      ]),
    })
    expect(r.settled).toBe(1)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'SETTLED',
      awayScore: 99,
      homeScore: 106,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(90)
  })

  it('never touches settled or void games', async () => {
    const g = await makeGame({ externalId: 501, status: 'VOID' })
    await syncGames({
      fetchGames: fetcher([
        apiGame({ status: 'Final', period: 4, visitor_team_score: 1, home_team_score: 2 }),
      ]),
    })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('VOID')
  })

  it('does not resurrect a game voided after it was read (void then Final from API)', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ externalId: 501 })
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await prisma.game.update({ where: { id: g.id }, data: { status: 'POSTPONED' } })
    await voidGame(admin.id, g.id, 'Postponed')
    const r = await syncGames({
      fetchGames: fetcher([
        apiGame({ status: 'Final', period: 4, visitor_team_score: 99, home_team_score: 106 }),
      ]),
    })
    expect(r.settled).toBe(0)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ status: 'VOID' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(100)
    await expectLedgerConsistent()
  })

  it('never touches settled games', async () => {
    const g = await makeGame({ externalId: 501, status: 'SETTLED', awayScore: 10, homeScore: 20 })
    await syncGames({
      fetchGames: fetcher([
        apiGame({ status: 'Final', period: 4, visitor_team_score: 1, home_team_score: 2 }),
      ]),
    })
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'SETTLED',
      awayScore: 10,
      homeScore: 20,
    })
  })

  it('isolates a malformed API record and still records the sync time', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const now = new Date('2026-11-11T12:00:00Z')
    const bad = apiGame({ id: 777, status: null as unknown as string })
    const r = await syncGames({ fetchGames: fetcher([bad, apiGame()]), now })
    expect(r).toMatchObject({ created: 1, errors: 1 })
    expect(await prisma.game.findUnique({ where: { externalId: 501 } })).not.toBeNull()
    expect(await getLastSyncAt()).toEqual(now)
    spy.mockRestore()
  })

  it('isolates a settlement failure and settles other final games', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = await makeGame({ externalId: 601, status: 'FINAL', awayScore: null, homeScore: null })
    const good = await makeGame({ externalId: 602, status: 'FINAL', awayScore: 99, homeScore: 106 })
    const r = await syncGames({ fetchGames: fetcher([]) })
    expect(r).toMatchObject({ settled: 1, errors: 1 })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: good.id } })).status).toBe('SETTLED')
    expect((await prisma.game.findUniqueOrThrow({ where: { id: broken.id } })).status).toBe('FINAL')
    spy.mockRestore()
  })

  // Review Focus #4
  it('updates tip-off time of a rescheduled game, keeping bets', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ externalId: 501, startsAt: new Date(Date.now() + 3600_000) })
    await placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })
    const newTime = new Date(Date.now() + 2 * 86400_000)
    await syncGames({ fetchGames: fetcher([apiGame({ datetime: newTime.toISOString() })]) })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).startsAt).toEqual(newTime)
    expect(await prisma.bet.count({ where: { gameId: g.id } })).toBe(1)
  })

  // Review Focus #3
  it('does not mark a game final when the API gives Final without scores', async () => {
    const g = await makeGame({ externalId: 501, status: 'LIVE' })
    const r = await syncGames({ fetchGames: fetcher([apiGame({ status: 'Final', period: 4 })]) })
    expect(r.skipped).toBe(1)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('LIVE')
  })

  it('flags postponed games and does not settle them', async () => {
    await syncGames({ fetchGames: fetcher([apiGame({ status: 'Postponed' })]) })
    expect((await prisma.game.findUniqueOrThrow({ where: { externalId: 501 } })).status).toBe('POSTPONED')
  })

  it('propagates fetch errors without updating the sync time', async () => {
    await expect(
      syncGames({
        fetchGames: async () => {
          throw new Error('down')
        },
      }),
    ).rejects.toThrow('down')
    expect(await getLastSyncAt()).toBeNull()
  })
})

describe('GET /api/cron/sync', () => {
  it('rejects requests without the cron secret', async () => {
    const res = await GET(new Request('http://localhost/api/cron/sync'))
    expect(res.status).toBe(401)
    const res2 = await GET(
      new Request('http://localhost/api/cron/sync', { headers: { authorization: 'Bearer wrong' } }),
    )
    expect(res2.status).toBe(401)
  })
})
