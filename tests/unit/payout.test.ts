import { describe, expect, it } from 'vitest'

import { computeSplit } from '@/lib/game/payout'

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
