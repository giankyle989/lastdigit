import { describe, expect, it } from 'vitest'

import { positiveIntOr } from '@/lib/rate-limit'

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
