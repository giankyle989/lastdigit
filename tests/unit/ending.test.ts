import { describe, expect, it } from 'vitest'

import { endingOf, formatEnding, winningEnding } from '@/lib/game/ending'

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

describe('winningEnding', () => {
  it('is known once FINAL or SETTLED with scores', () => {
    expect(winningEnding({ status: 'FINAL', awayScore: 99, homeScore: 106 })).toEqual({
      awayDigit: 9,
      homeDigit: 6,
    })
    expect(winningEnding({ status: 'SETTLED', awayScore: 100, homeScore: 91 })).toEqual({
      awayDigit: 0,
      homeDigit: 1,
    })
  })

  it('is null while live, void or without scores', () => {
    expect(winningEnding({ status: 'LIVE', awayScore: 50, homeScore: 48 })).toBeNull()
    expect(winningEnding({ status: 'VOID', awayScore: 99, homeScore: 106 })).toBeNull()
    expect(winningEnding({ status: 'FINAL', awayScore: null, homeScore: 106 })).toBeNull()
  })
})
