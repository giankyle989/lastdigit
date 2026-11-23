import { describe, expect, it } from 'vitest'

import { availableFor, notEnoughMessage, otherAccount, splitReturn } from '@/lib/funding'

describe('splitReturn', () => {
  it('returns the points stake to points and the rest to the wallet', () => {
    expect(splitReturn(250, 60)).toEqual({ points: 60, wallet: 190 })
  })

  it('a refund of the stake goes back exactly as it was paid', () => {
    expect(splitReturn(100, 60)).toEqual({ points: 60, wallet: 40 })
  })

  it('a wallet-only bet returns everything to the wallet', () => {
    expect(splitReturn(180, 0)).toEqual({ points: 0, wallet: 180 })
  })

  it('never returns more points than the amount', () => {
    expect(splitReturn(50, 60)).toEqual({ points: 50, wallet: 0 })
  })
})

describe('bet accounts', () => {
  it('counts only the chosen balance, a negative one as 0', () => {
    expect(availableFor('POINTS', { wallet: 700, points: 40 })).toBe(40)
    expect(availableFor('WALLET', { wallet: 700, points: 40 })).toBe(700)
    expect(availableFor('WALLET', { wallet: -25, points: 40 })).toBe(0)
  })
  it('names the account in the not-enough message', () => {
    expect(notEnoughMessage('POINTS', 40)).toBe('Not enough points (40 pts).')
    expect(notEnoughMessage('WALLET', 25)).toBe('Not enough in the wallet (₱25).')
  })
  it('knows the other account', () => {
    expect(otherAccount('WALLET')).toBe('POINTS')
    expect(otherAccount('POINTS')).toBe('WALLET')
  })
})
