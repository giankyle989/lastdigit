import { describe, expect, it } from 'vitest'

import { splitReturn, splitStake } from '@/lib/funding'

describe('splitStake', () => {
  it('spends points first, then the wallet', () => {
    expect(splitStake(100, 0)).toEqual({ points: 0, wallet: 100 })
    expect(splitStake(100, 60)).toEqual({ points: 60, wallet: 40 })
    expect(splitStake(100, 500)).toEqual({ points: 100, wallet: 0 })
  })

  it('treats negative points as none', () => {
    expect(splitStake(100, -30)).toEqual({ points: 0, wallet: 100 })
  })
})

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
