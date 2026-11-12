import { beforeEach, describe, expect, it } from 'vitest'

import { placeBet } from '@/server/bets'
import { getGameForPlayer } from '@/server/queries/player'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('player queries', () => {
  beforeEach(resetDb)

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
