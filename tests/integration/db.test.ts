import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { makeGame, makeUser, resetDb } from '../helpers/db'

describe('database', () => {
  beforeEach(resetDb)

  it('creates users and games', async () => {
    const user = await makeUser({ username: 'Kyle' })
    await makeGame()
    expect(user.usernameKey).toBe('kyle')
    expect(await prisma.user.count()).toBe(1)
    expect(await prisma.game.count()).toBe(1)
  })

  it('enforces case-insensitive unique usernames via usernameKey', async () => {
    await makeUser({ username: 'Kyle' })
    await expect(makeUser({ username: 'kyle' })).rejects.toThrow()
  })
})
