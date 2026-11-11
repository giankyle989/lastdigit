import { describe, expect, it } from 'vitest'
import { endingOf, formatEnding } from '@/lib/game/ending'

describe('endingOf', () => {
  it('takes the last digit of away and home scores', () => {
    expect(endingOf(99, 106)).toEqual({ awayDigit: 9, homeDigit: 6 })
  })
  it('handles scores ending in zero', () => {
    expect(endingOf(110, 100)).toEqual({ awayDigit: 0, homeDigit: 0 })
  })
  it('rejects invalid scores', () => {
    expect(() => endingOf(-1, 100)).toThrow()
    expect(() => endingOf(99.5, 100)).toThrow()
  })
})

describe('formatEnding', () => {
  it('formats away-home', () => {
    expect(formatEnding({ awayDigit: 9, homeDigit: 6 })).toBe('9-6')
  })
})
