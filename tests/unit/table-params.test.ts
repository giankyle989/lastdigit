import { describe, expect, it } from 'vitest'

import {
  etDateBounds,
  formatSort,
  parseEtDateParam,
  parseOption,
  parseSearch,
  parseSort,
} from '@/lib/table-params'
import { hrefWith, isActivePath } from '@/lib/url'

const FIELDS = ['username', 'balance', 'joined'] as const
const fallback = { field: 'joined', dir: 'desc' } as const

describe('parseSort', () => {
  it('accepts whitelisted fields in both directions', () => {
    expect(parseSort('balance', FIELDS, fallback)).toEqual({ field: 'balance', dir: 'asc' })
    expect(parseSort('-username', FIELDS, fallback)).toEqual({ field: 'username', dir: 'desc' })
    expect(parseSort(['-balance', 'joined'], FIELDS, fallback)).toEqual({ field: 'balance', dir: 'desc' })
  })

  it.each([undefined, '', '-', '--balance', 'passwordHash', '-passwordHash', 'Balance', 'balance;drop'])(
    'falls back for %o',
    (raw) => {
      expect(parseSort(raw, FIELDS, fallback)).toEqual(fallback)
    },
  )

  it('round-trips through formatSort', () => {
    expect(formatSort({ field: 'joined', dir: 'desc' })).toBe('-joined')
    expect(formatSort({ field: 'balance', dir: 'asc' })).toBe('balance')
  })
})

describe('search and options', () => {
  it('trims and caps search text', () => {
    expect(parseSearch('  bob ')).toBe('bob')
    expect(parseSearch('   ')).toBeUndefined()
    expect(parseSearch(undefined)).toBeUndefined()
    expect(parseSearch('x'.repeat(150))).toHaveLength(100)
  })

  it('accepts only listed options', () => {
    expect(parseOption('OPEN', ['OPEN', 'CLOSED'] as const)).toBe('OPEN')
    expect(parseOption('all', ['OPEN', 'CLOSED'] as const)).toBeUndefined()
    expect(parseOption('open', ['OPEN', 'CLOSED'] as const)).toBeUndefined()
  })
})

describe('ET date filters', () => {
  it('accepts only real dates', () => {
    expect(parseEtDateParam('2026-11-11')).toBe('2026-11-11')
    expect(parseEtDateParam('2026-13-01')).toBeUndefined()
    expect(parseEtDateParam('11/11/2026')).toBeUndefined()
    expect(parseEtDateParam(undefined)).toBeUndefined()
  })

  it('turns an inclusive ET range into UTC bounds', () => {
    expect(etDateBounds('2026-11-10', '2026-11-11')).toEqual({
      gte: new Date('2026-11-10T05:00:00Z'),
      lt: new Date('2026-11-12T05:00:00Z'),
    })
    expect(etDateBounds(undefined, '2026-07-04')).toEqual({ lt: new Date('2026-07-05T04:00:00Z') })
    expect(etDateBounds()).toBeUndefined()
  })
})

describe('hrefWith', () => {
  it('patches search params and drops empty values', () => {
    expect(hrefWith('/admin/players', { q: 'bob', page: '3' }, { player: 'p1' })).toBe(
      '/admin/players?q=bob&page=3&player=p1',
    )
    expect(hrefWith('/admin/players', { q: 'bob', player: 'p1' }, { player: undefined })).toBe(
      '/admin/players?q=bob',
    )
    expect(hrefWith('/x', { q: ['a', 'b'], sort: '' }, { page: 2 })).toBe('/x?q=a&page=2')
    expect(hrefWith('/x', {}, {})).toBe('/x')
  })
})

describe('isActivePath', () => {
  it('matches a section and its children, or exactly', () => {
    expect(isActivePath('/games/abc', '/games')).toBe(true)
    expect(isActivePath('/games', '/games')).toBe(true)
    expect(isActivePath('/gamesx', '/games')).toBe(false)
    expect(isActivePath('/admin/players', '/admin', true)).toBe(false)
    expect(isActivePath('/admin', '/admin', true)).toBe(true)
  })
})
