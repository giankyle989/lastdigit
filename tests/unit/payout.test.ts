import { describe, expect, it } from 'vitest'

import { computeSplit, estimatePayout } from '@/lib/game/payout'

describe('computeSplit', () => {
  it('splits 90% of the pool pro-rata by stake', () => {
    const s = computeSplit([
      { id: 'a', stake: 100, isWinner: true },
      { id: 'b', stake: 300, isWinner: true },
      { id: 'c', stake: 600, isWinner: false },
    ])
    expect(s.pool).toBe(1000)
    expect(s.payouts.get('a')).toBe(225)
    expect(s.payouts.get('b')).toBe(675)
    expect(s.payouts.has('c')).toBe(false)
    expect(s.houseTake).toBe(100)
  })

  it('floors payouts and gives the remainder to the house', () => {
    const s = computeSplit([
      { id: 'a', stake: 1, isWinner: true },
      { id: 'b', stake: 2, isWinner: true },
    ])
    // pool 3, payoutPool floor(2.7)=2, a=floor(2*1/3)=0, b=floor(2*2/3)=1
    expect(s.payouts.get('a')).toBe(0)
    expect(s.payouts.get('b')).toBe(1)
    expect(s.houseTake).toBe(2)
  })

  it('house keeps everything when there are no winners', () => {
    const s = computeSplit([
      { id: 'a', stake: 50, isWinner: false },
      { id: 'b', stake: 70, isWinner: false },
    ])
    expect(s.pool).toBe(120)
    expect(s.houseTake).toBe(120)
    expect(s.payouts.size).toBe(0)
  })

  it('handles an empty pool', () => {
    const s = computeSplit([])
    expect(s).toEqual({ pool: 0, houseTake: 0, payouts: new Map() })
  })

  it('does not lose precision on large stakes', () => {
    const s = computeSplit([
      { id: 'a', stake: 900_000_000, isWinner: true },
      { id: 'b', stake: 1_000_000_000, isWinner: false },
    ])
    expect(s.payouts.get('a')).toBe(1_710_000_000)
    expect(s.houseTake).toBe(190_000_000)
  })
})

describe('estimatePayout', () => {
  // The estimate must equal what settlement would pay if the game ended now on this ending.
  function settledPayout(pool: number, endingStake: number, stake: number): number {
    const bets = [
      { id: 'others-on-ending', stake: endingStake, isWinner: true },
      { id: 'rest-of-pool', stake: pool - endingStake, isWinner: false },
      { id: 'me', stake, isWinner: true },
    ].filter((b) => b.stake > 0)
    return computeSplit(bets).payouts.get('me') ?? 0
  }

  it.each([
    [0, 0, 100], // empty pool: you get 90% of your own stake
    [1000, 0, 100], // nobody else on the ending
    [1000, 300, 100],
    [1000, 1000, 100], // everyone on your ending
    [5, 2, 1], // tiny numbers, flooring
    [1200, 0, 1],
    [123_457, 4_321, 999],
    [1_000_000_000, 250_000_000, 1_000_000_000], // large values stay exact
  ])('pool=%i endingStake=%i stake=%i matches computeSplit', (pool, endingStake, stake) => {
    expect(estimatePayout(pool, endingStake, stake)).toBe(settledPayout(pool, endingStake, stake))
  })

  it('matches computeSplit across a grid of small values', () => {
    for (let pool = 0; pool <= 60; pool += 7) {
      for (let endingStake = 0; endingStake <= pool; endingStake += 5) {
        for (const stake of [1, 2, 3, 10, 50]) {
          expect(estimatePayout(pool, endingStake, stake)).toBe(settledPayout(pool, endingStake, stake))
        }
      }
    }
  })

  it('is the documented formula', () => {
    // floor(floor((1000 + 100) * 90 / 100) * 100 / (300 + 100)) = floor(990 * 100 / 400) = 247
    expect(estimatePayout(1000, 300, 100)).toBe(247)
  })

  it('returns 0 for a non-positive or fractional stake', () => {
    expect(estimatePayout(1000, 0, 0)).toBe(0)
    expect(estimatePayout(1000, 0, -5)).toBe(0)
    expect(estimatePayout(1000, 0, 1.5)).toBe(0)
  })
})
