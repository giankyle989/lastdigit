import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { getEndingStakes } from '@/server/queries/stakes'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('getEndingStakes', () => {
  beforeEach(resetDb)

  it('returns an all-zero 10x10 grid for a game without bets', async () => {
    const g = await makeGame()
    const s = await getEndingStakes(g.id)
    expect(s.pool).toBe(0)
    expect(s.cells).toHaveLength(10)
    for (const row of s.cells) expect(row).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('sums stakes per ending across players and excludes REFUNDED bets', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await fundUser(a.id, 1000)
    await fundUser(b.id, 1000)
    const g = await makeGame()
    await placeBet(a.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await placeBet(b.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 50 })
    await placeBet(b.id, { gameId: g.id, awayDigit: 0, homeDigit: 9, stake: 30 })
    const refunded = await placeBet(a.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 70 })
    await prisma.bet.update({ where: { id: refunded.id }, data: { result: 'REFUNDED' } })

    const s = await getEndingStakes(g.id)
    expect(s.cells[9]?.[6]).toBe(150)
    expect(s.cells[0]?.[9]).toBe(30)
    expect(s.cells[1]?.[1]).toBe(0)
    expect(s.pool).toBe(180)
    expect(JSON.stringify(s)).not.toContain(a.username)
  })

  it('only counts the requested game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g1 = await makeGame()
    const g2 = await makeGame()
    await placeBet(u.id, { gameId: g2.id, awayDigit: 2, homeDigit: 2, stake: 40 })
    expect((await getEndingStakes(g1.id)).pool).toBe(0)
  })
})
