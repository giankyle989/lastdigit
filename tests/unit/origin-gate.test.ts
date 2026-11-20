import { describe, expect, it } from 'vitest'

import { ORIGIN_SECRET_HEADER, originAllowed } from '@/lib/origin-gate'

describe('origin gate', () => {
  it('lets everything through when no secret is configured (local, tests, self-hosted)', () => {
    expect(originAllowed(undefined, null)).toBe(true)
    expect(originAllowed('', 'anything')).toBe(true)
  })

  it('requires the exact secret when one is configured', () => {
    const secret = 's3cret-value-from-the-worker'
    expect(originAllowed(secret, secret)).toBe(true)
    expect(originAllowed(secret, null)).toBe(false)
    expect(originAllowed(secret, '')).toBe(false)
    expect(originAllowed(secret, 's3cret-value-from-the-workeR')).toBe(false)
    expect(originAllowed(secret, `${secret}x`)).toBe(false)
    expect(originAllowed(secret, secret.slice(0, -1))).toBe(false)
  })

  it('names the header the Worker sends', () => {
    expect(ORIGIN_SECRET_HEADER).toBe('x-origin-secret')
  })
})
