import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { runAction } from '@/lib/action-state'
import { DomainError } from '@/lib/errors'

describe('runAction', () => {
  it('returns ok on success', async () => {
    expect(
      await runAction(
        async () => 3,
        (n) => `got ${n}`,
      ),
    ).toEqual({ ok: 'got 3' })
    expect(await runAction(async () => 3)).toEqual({ ok: 'Done' })
  })
  it('maps DomainError to its message', async () => {
    expect(
      await runAction(async () => {
        throw new DomainError('BETTING_CLOSED', 'Betting closed')
      }),
    ).toEqual({ error: 'Betting closed' })
  })
  it('maps ZodError to its first issue', async () => {
    expect(await runAction(async () => z.string().min(3, 'Too short').parse('a'))).toEqual({
      error: 'Too short',
    })
  })
  it('rethrows unknown errors', async () => {
    await expect(
      runAction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
