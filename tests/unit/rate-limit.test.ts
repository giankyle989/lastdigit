import { describe, expect, it } from 'vitest'

import { createRateLimiter, positiveIntOr } from '@/lib/rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit per key within the window, then frees up as events age out', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 })
    expect(rl.allows('a', 0)).toBe(true)
    rl.record('a', 0)
    rl.record('a', 500)
    expect(rl.allows('a', 900)).toBe(false)
    expect(rl.allows('b', 900)).toBe(true) // other keys are independent
    expect(rl.allows('a', 1000)).toBe(true) // the first event aged out
  })
})

describe('positiveIntOr', () => {
  it('parses positive integers and falls back otherwise', () => {
    expect(positiveIntOr('7', 5)).toBe(7)
    expect(positiveIntOr(undefined, 5)).toBe(5)
    expect(positiveIntOr('0', 5)).toBe(5)
    expect(positiveIntOr('-3', 5)).toBe(5)
    expect(positiveIntOr('2.5', 5)).toBe(5)
    expect(positiveIntOr('abc', 5)).toBe(5)
  })
})
