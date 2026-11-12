import { describe, expect, it } from 'vitest'

import {
  addEtDays,
  etDateOf,
  etDateStrip,
  etDayRange,
  isEtDate,
  parseStripDate,
  shortDayLabel,
} from '@/lib/dates'

describe('ET date helpers', () => {
  it('maps instants to ET calendar dates around midnight ET', () => {
    expect(etDateOf(new Date('2026-11-12T04:59:59Z'))).toBe('2026-11-11') // 23:59:59 EST
    expect(etDateOf(new Date('2026-11-12T05:00:00Z'))).toBe('2026-11-12') // 00:00 EST
    expect(etDateOf(new Date('2026-07-05T03:59:59Z'))).toBe('2026-07-04') // 23:59:59 EDT
    expect(etDateOf(new Date('2026-07-05T04:00:00Z'))).toBe('2026-07-05')
  })

  it('returns UTC ranges for normal and DST days', () => {
    expect(etDayRange('2026-11-11')).toEqual({
      start: new Date('2026-11-11T05:00:00Z'),
      end: new Date('2026-11-12T05:00:00Z'),
    })
    // DST ends 2026-11-01 02:00 EDT: a 25-hour day
    expect(etDayRange('2026-11-01')).toEqual({
      start: new Date('2026-11-01T04:00:00Z'),
      end: new Date('2026-11-02T05:00:00Z'),
    })
    // DST starts 2026-03-08 02:00 EST: a 23-hour day
    expect(etDayRange('2026-03-08')).toEqual({
      start: new Date('2026-03-08T05:00:00Z'),
      end: new Date('2026-03-09T04:00:00Z'),
    })
  })

  it('validates and adds dates', () => {
    expect(isEtDate('2026-02-28')).toBe(true)
    expect(isEtDate('2026-02-30')).toBe(false)
    expect(isEtDate('2026-2-3')).toBe(false)
    expect(isEtDate('yesterday')).toBe(false)
    expect(addEtDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addEtDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(shortDayLabel('2026-11-13')).toBe('Fri 13')
  })

  it('builds the 8-day strip from yesterday in ET', () => {
    const now = new Date('2026-11-12T03:00:00Z') // 22:00 ET on Nov 11
    const strip = etDateStrip(now)
    expect(strip.map((d) => d.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ])
    expect(strip.slice(0, 3).map((d) => d.label)).toEqual(['Yesterday', 'Today', 'Thu 12'])
  })

  it('falls back to Today for invalid or out-of-range ?date=', () => {
    const now = new Date('2026-11-11T17:00:00Z')
    expect(parseStripDate('2026-11-13', now)).toBe('2026-11-13')
    expect(parseStripDate('2026-11-10', now)).toBe('2026-11-10')
    expect(parseStripDate(undefined, now)).toBe('2026-11-11')
    expect(parseStripDate('2026-11-09', now)).toBe('2026-11-11')
    expect(parseStripDate('2026-11-30', now)).toBe('2026-11-11')
    expect(parseStripDate('not-a-date', now)).toBe('2026-11-11')
    expect(parseStripDate(['2026-11-13'], now)).toBe('2026-11-11')
  })
})
