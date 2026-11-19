import { describe, expect, it } from 'vitest'

import { adjustToast } from '@/lib/wallet'

describe('adjustToast', () => {
  it('names what happened', () => {
    expect(adjustToast({ kind: 'CASH_OUT', welcomeBonus: 0, referralBonus: 0 })).toBe('Cash out recorded')
    expect(adjustToast({ kind: 'GIVE_POINTS', welcomeBonus: 0, referralBonus: 0 })).toBe('Points given')
    expect(adjustToast({ kind: 'TAKE_POINTS', welcomeBonus: 0, referralBonus: 0 })).toBe('Points taken')
    expect(adjustToast({ kind: 'CASH_IN', welcomeBonus: 0, referralBonus: 0 })).toBe('Cash in recorded')
  })

  it('lists the bonuses a first cash in paid', () => {
    expect(adjustToast({ kind: 'CASH_IN', welcomeBonus: 1000, referralBonus: 200 })).toBe(
      'Cash in recorded (+1,000 welcome bonus points, +200 points to their referrer)',
    )
    expect(adjustToast({ kind: 'CASH_IN', welcomeBonus: 500, referralBonus: 0 })).toBe(
      'Cash in recorded (+500 welcome bonus points)',
    )
  })
})
