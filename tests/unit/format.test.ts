import { describe, expect, it } from 'vitest'

import {
  formatCountdown,
  formatDate,
  formatDateTime,
  formatDay,
  formatPoints,
  formatRelative,
  formatSignedPoints,
  formatTipoffTime,
} from '@/lib/format'

describe('format', () => {
  it('formats PHT tip-off times', () => {
    expect(formatTipoffTime(new Date('2026-11-12T00:30:00Z'))).toBe('8:30 AM PHT')
  })

  it('formats points with separators and signs', () => {
    expect(formatPoints(1200)).toBe('1,200')
    expect(formatSignedPoints(90)).toBe('+90')
    expect(formatSignedPoints(-100)).toBe('-100')
    expect(formatSignedPoints(0)).toBe('0')
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
