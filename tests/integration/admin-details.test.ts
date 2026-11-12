import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { getGameDetail, getPlayerDetail } from '@/server/admin/queries'
import { placeBet } from '@/server/bets'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('admin drawer details', () => {
  beforeEach(resetDb)

  it('loads a game with its pool breakdown and winners', async () => {
    const u = await makeUser({ username: 'winner' })
    await fundUser(u.id, 500)
    const g = await makeGame()
    const bet = await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await prisma.bet.update({ where: { id: bet.id }, data: { result: 'WON', payout: 90 } })

    const d = await getGameDetail(g.id)
    expect(d?.game.id).toBe(g.id)
    expect(d?.stakes.cells[9]?.[6]).toBe(100)
    expect(d?.winners.map((w) => [w.user.username, w.payout])).toEqual([['winner', 90]])
    expect(await getGameDetail('missing')).toBeNull()
  })

  it('loads players only, never admins', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    expect((await getPlayerDetail(p.id))?.id).toBe(p.id)
    expect(await getPlayerDetail(admin.id)).toBeNull()
    expect(await getPlayerDetail('missing')).toBeNull()
  })
})
