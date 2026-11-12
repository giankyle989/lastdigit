import { describe, expect, it } from 'vitest'

import {
  addDays,
  dateStrip,
  isLocalDate,
  localDateOf,
  localDayRange,
  parseStripDate,
  shortDayLabel,
} from '@/lib/dates'

describe('PHT date helpers', () => {
  it('maps instants to PHT calendar dates around midnight PHT', () => {
    expect(localDateOf(new Date('2026-11-11T15:59:59Z'))).toBe('2026-11-11') // 23:59:59 PHT
    expect(localDateOf(new Date('2026-11-11T16:00:00Z'))).toBe('2026-11-12') // 00:00 PHT
    expect(localDateOf(new Date('2026-07-04T15:59:59Z'))).toBe('2026-07-04') // no DST in summer either
    expect(localDateOf(new Date('2026-07-04T16:00:00Z'))).toBe('2026-07-05')
  })

  it('returns UTC ranges; every day is exactly 24h (no DST)', () => {
    expect(localDayRange('2026-11-11')).toEqual({
      start: new Date('2026-11-10T16:00:00Z'),
      end: new Date('2026-11-11T16:00:00Z'),
    })
    const { start, end } = localDayRange('2026-03-08')
    expect(end.getTime() - start.getTime()).toBe(86_400_000)
  })

  it('validates and adds dates', () => {
    expect(isLocalDate('2026-02-28')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('2026-2-3')).toBe(false)
    expect(isLocalDate('yesterday')).toBe(false)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(shortDayLabel('2026-11-13')).toBe('Fri 13')
  })

  it('builds the 8-day strip from yesterday in PHT', () => {
    const now = new Date('2026-11-11T16:30:00Z') // 00:30 PHT on Nov 12
    const strip = dateStrip(now)
    expect(strip.map((d) => d.date)).toEqual([
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ])
    expect(strip.slice(0, 3).map((d) => d.label)).toEqual(['Yesterday', 'Today', 'Fri 13'])
  })

  it('falls back to Today for invalid or out-of-range ?date=', () => {
    const now = new Date('2026-11-11T02:00:00Z') // 10:00 PHT Nov 11
    expect(parseStripDate('2026-11-13', now)).toBe('2026-11-13')
    expect(parseStripDate('2026-11-10', now)).toBe('2026-11-10')
    expect(parseStripDate(undefined, now)).toBe('2026-11-11')
    expect(parseStripDate('2026-11-09', now)).toBe('2026-11-11')
    expect(parseStripDate('2026-11-30', now)).toBe('2026-11-11')
    expect(parseStripDate('not-a-date', now)).toBe('2026-11-11')
    expect(parseStripDate(['2026-11-13'], now)).toBe('2026-11-11')
  })
})
