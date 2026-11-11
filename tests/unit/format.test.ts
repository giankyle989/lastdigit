import { describe, expect, it } from 'vitest'

import {
  formatCountdown,
  formatEtDay,
  formatPoints,
  formatRelative,
  formatSignedPoints,
  formatTipoffTime,
} from '@/lib/format'

describe('format', () => {
  it('formats ET tip-off times', () => {
    expect(formatTipoffTime(new Date('2026-11-12T00:30:00Z'))).toBe('7:30 PM ET')
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

  it('formats ET days', () => {
    expect(formatEtDay('2026-11-11')).toBe('Wed, Nov 11')
  })

  it('formats relative times', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    expect(formatRelative(new Date('2026-11-11T11:59:30Z'), now)).toBe('just now')
    expect(formatRelative(new Date('2026-11-11T11:48:00Z'), now)).toBe('12 min ago')
    expect(formatRelative(new Date('2026-11-11T09:00:00Z'), now)).toBe('3 h ago')
    expect(formatRelative(new Date('2026-11-08T12:00:00Z'), now)).toBe('3 d ago')
  })
})
