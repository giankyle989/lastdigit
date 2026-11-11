import { beforeEach, describe, expect, it } from 'vitest'

import { listTransactionsAdmin, searchPlayers } from '@/server/admin/queries'

import { fundUser, makeUser, resetDb } from '../helpers/db'

describe('admin queries', () => {
  beforeEach(resetDb)

  it('searches players case-insensitively and filters transactions', async () => {
    const kyle = await makeUser({ username: 'Kyle' })
    await makeUser({ username: 'bob' })
    await makeUser({ username: 'boss', role: 'ADMIN' })
    expect((await searchPlayers('KY')).map((u) => u.username)).toEqual(['Kyle'])
    await fundUser(kyle.id, 10)
    const txs = await listTransactionsAdmin({ username: 'KYLE', type: 'ADMIN_GRANT' })
    expect(txs).toHaveLength(1)
    expect(txs[0]?.user.username).toBe('Kyle')
  })
})
