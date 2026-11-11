import { beforeEach, describe, expect, it } from 'vitest'
import { placeBet } from '@/server/bets'
import { getGameForPlayer, listUpcomingGames } from '@/server/queries/player'
import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('player queries', () => {
  beforeEach(resetDb)

  it('lists games from the last 36 hours onward, soonest first', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    await makeGame({ startsAt: new Date('2026-11-09T00:00:00Z') }) // too old
    const later = await makeGame({ startsAt: new Date('2026-11-12T00:00:00Z') })
    const recent = await makeGame({ startsAt: new Date('2026-11-11T00:00:00Z') })
    expect((await listUpcomingGames(now)).map((g) => g.id)).toEqual([recent.id, later.id])
  })

  it('returns only the viewer bets for a game', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(me.id, 100)
    await fundUser(other.id, 100)
    const g = await makeGame()
    await placeBet(me.id, { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 10 })
    await placeBet(other.id, { gameId: g.id, awayDigit: 3, homeDigit: 4, stake: 10 })
    const data = await getGameForPlayer(g.id, me.id)
    expect(data?.myBets.map((b) => [b.awayDigit, b.homeDigit])).toEqual([[1, 2]])
    expect(await getGameForPlayer('missing', me.id)).toBeNull()
  })
})
