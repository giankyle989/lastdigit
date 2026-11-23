import { describe, expect, it } from 'vitest'

import {
  accountKind,
  formatAmount,
  formatCountdown,
  formatDate,
  formatDateTime,
  formatDay,
  formatRelative,
  formatSplit,
  formatTipoffTime,
} from '@/lib/format'

describe('format', () => {
  it('formats PHT tip-off times', () => {
    expect(formatTipoffTime(new Date('2026-11-12T00:30:00Z'))).toBe('8:30 AM PHT')
  })

  it('formats countdowns', () => {
    expect(formatCountdown(2 * 3600_000 + 5 * 60_000 + 9_000)).toBe('2h 05m 09s')
    expect(formatCountdown(4 * 60_000 + 9_000)).toBe('4m 09s')
    expect(formatCountdown(-5)).toBe('0m 00s')
  })

  it('formats days', () => {
    expect(formatDay('2026-11-11')).toBe('Wed, Nov 11')
  })

  it('formats relative times', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    expect(formatRelative(new Date('2026-11-11T11:59:30Z'), now)).toBe('just now')
    expect(formatRelative(new Date('2026-11-11T11:48:00Z'), now)).toBe('12 min ago')
    expect(formatRelative(new Date('2026-11-11T09:00:00Z'), now)).toBe('3 h ago')
    expect(formatRelative(new Date('2026-11-08T12:00:00Z'), now)).toBe('3 d ago')
  })

  it('formats the PHT calendar date', () => {
    expect(formatDate(new Date('2026-11-12T00:00:00Z'))).toBe('Nov 12, 2026')
    expect(formatDate(new Date('2026-11-11T16:00:00Z'))).toBe('Nov 12, 2026') // 00:00 PHT
    expect(formatDate(new Date('2026-11-11T15:59:59Z'))).toBe('Nov 11, 2026')
  })

  it('formats date-times in PHT', () => {
    expect(formatDateTime(new Date('2026-11-12T00:30:00Z'))).toBe('Nov 12, 2026, 8:30 AM PHT')
  })
})

describe('labelled amounts', () => {
  it('formats wallet in pesos, points in pts and pools plain', () => {
    expect(formatAmount('wallet', 1240)).toBe('₱1,240')
    expect(formatAmount('wallet', -25)).toBe('-₱25')
    expect(formatAmount('wallet', 0)).toBe('₱0')
    expect(formatAmount('points', 40)).toBe('40 pts')
    expect(formatAmount('points', -40)).toBe('-40 pts')
    expect(formatAmount('pool', 1240)).toBe('1,240')
  })

  it('adds a plus sign when signed', () => {
    expect(formatAmount('wallet', 100, { signed: true })).toBe('+₱100')
    expect(formatAmount('wallet', -100, { signed: true })).toBe('-₱100')
    expect(formatAmount('points', 40, { signed: true })).toBe('+40 pts')
    expect(formatAmount('wallet', 0, { signed: true })).toBe('₱0')
  })

  it('writes mixed amounts wallet first and drops zero parts', () => {
    expect(formatSplit({ wallet: 60, points: 40 })).toBe('₱60 + 40 pts')
    expect(formatSplit({ wallet: 0, points: 40 })).toBe('40 pts')
    expect(formatSplit({ wallet: 210, points: 0 })).toBe('₱210')
    expect(formatSplit({ wallet: 0, points: 0 })).toBe('₱0')
    expect(formatSplit({ wallet: 210, points: 100 }, { signed: true })).toBe('+₱210 + 100 pts')
  })

  it('maps ledger accounts to kinds', () => {
    expect(accountKind('WALLET')).toBe('wallet')
    expect(accountKind('POINTS')).toBe('points')
  })
})
