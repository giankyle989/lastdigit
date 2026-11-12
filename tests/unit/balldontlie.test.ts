import { describe, expect, it, vi } from 'vitest'

import { type ApiGame, createBalldontlieFetcher, mapApiGame } from '@/server/sync/balldontlie'
import { syncDates } from '@/server/sync/sync'

function apiGame(over: Partial<ApiGame> = {}): ApiGame {
  return {
    id: 1,
    date: '2026-11-11',
    datetime: '2026-11-12T00:00:00.000Z',
    status: 'Final',
    period: 4,
    home_team_score: 106,
    visitor_team_score: 99,
    home_team: { abbreviation: 'GSW' },
    visitor_team: { abbreviation: 'LAL' },
    ...over,
  }
}

describe('mapApiGame', () => {
  it('maps a final game (visitor = away)', () => {
    expect(mapApiGame(apiGame())).toEqual({
      externalId: 1,
      startsAt: new Date('2026-11-12T00:00:00.000Z'),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      awayScore: 99,
      homeScore: 106,
      status: 'FINAL',
    })
  })

  it('maps a live game', () => {
    expect(mapApiGame(apiGame({ status: '3rd Qtr', period: 3 }))?.status).toBe('LIVE')
  })

  it('maps a scheduled game with null scores', () => {
    const m = mapApiGame(
      apiGame({ status: '7:00 pm ET', period: 0, home_team_score: 0, visitor_team_score: 0 }),
    )
    expect(m).toMatchObject({ status: 'SCHEDULED', awayScore: null, homeScore: null })
  })

  it('uses an ISO status as tip-off time when datetime is missing', () => {
    const m = mapApiGame(apiGame({ datetime: null, status: '2026-11-12T00:30:00Z', period: 0 }))
    expect(m?.startsAt).toEqual(new Date('2026-11-12T00:30:00Z'))
  })

  it('skips a scheduled game with no known tip-off time', () => {
    expect(mapApiGame(apiGame({ datetime: null, status: 'TBD', period: 0 }))).toBeNull()
  })

  it('maps postponed games', () => {
    expect(mapApiGame(apiGame({ status: 'Postponed', period: 0 }))?.status).toBe('POSTPONED')
  })

  // Review Focus #3
  it('skips a Final game with missing scores', () => {
    expect(mapApiGame(apiGame({ home_team_score: 0, visitor_team_score: 0 }))).toBeNull()
  })
})

describe('createBalldontlieFetcher', () => {
  it('sends the API key, all dates, and follows cursors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [apiGame({ id: 1 })], meta: { next_cursor: 5 } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [apiGame({ id: 2 })], meta: { next_cursor: null } })),
      )
    const fetchGames = createBalldontlieFetcher(
      'KEY',
      fetchImpl as unknown as typeof fetch,
      'https://x.test/v1',
    )
    const games = await fetchGames(['2026-11-10', '2026-11-11'])
    expect(games.map((g) => g.id)).toEqual([1, 2])
    const call1 = fetchImpl.mock.calls[0]
    if (!call1) throw new Error('missing fetch call')
    const [url1, init1] = call1
    expect(String(url1)).toBe(
      'https://x.test/v1/games?dates%5B%5D=2026-11-10&dates%5B%5D=2026-11-11&per_page=100',
    )
    expect(init1.headers).toEqual({ Authorization: 'KEY' })
    expect(init1.signal).toBeDefined()
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('cursor=5')
  })

  it('throws on HTTP errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 429 }))
    const fetchGames = createBalldontlieFetcher('KEY', fetchImpl as unknown as typeof fetch)
    await expect(fetchGames(['2026-11-11'])).rejects.toThrow('balldontlie 429')
  })
})

describe('syncDates', () => {
  it('returns PHT today-2 through today+7', () => {
    // 17:00 UTC on Nov 10 is 01:00 PHT on Nov 11
    expect(syncDates(new Date('2026-11-10T17:00:00Z'))).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ])
  })
})
