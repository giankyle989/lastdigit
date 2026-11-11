import { describe, expect, it } from 'vitest'

import { groupIntoSections, sectionOf } from '@/lib/game/sections'
import { parseBetTab } from '@/lib/my-bets'
import { pageWindow, parsePage } from '@/lib/pagination'
import { parseWalletFilter } from '@/lib/wallet'

const now = new Date('2026-11-11T20:00:00Z')
const later = new Date('2026-11-12T00:00:00Z')
const earlier = new Date('2026-11-11T19:00:00Z')

describe('feed sections', () => {
  it('assigns each status to its section', () => {
    expect(sectionOf({ status: 'LIVE', startsAt: earlier }, now)).toBe('live')
    expect(sectionOf({ status: 'SCHEDULED', startsAt: later }, now)).toBe('open')
    expect(sectionOf({ status: 'SCHEDULED', startsAt: earlier }, now)).toBe('closed')
    expect(sectionOf({ status: 'POSTPONED', startsAt: later }, now)).toBe('closed')
    for (const status of ['FINAL', 'SETTLED', 'VOID'] as const) {
      expect(sectionOf({ status, startsAt: earlier }, now)).toBe('final')
    }
  })

  it('orders sections Live, Open, Upcoming/closed, Final and drops empty ones', () => {
    const games = [
      { id: 'f', status: 'FINAL' as const, startsAt: earlier },
      { id: 'c', status: 'SCHEDULED' as const, startsAt: earlier },
      { id: 'o', status: 'SCHEDULED' as const, startsAt: later },
      { id: 'l', status: 'LIVE' as const, startsAt: earlier },
    ]
    expect(groupIntoSections(games, now).map((s) => [s.title, s.games.map((g) => g.id)])).toEqual([
      ['Live', ['l']],
      ['Open for bets', ['o']],
      ['Upcoming / closed', ['c']],
      ['Final', ['f']],
    ])
    expect(groupIntoSections([], now)).toEqual([])
  })
})

describe('param parsing', () => {
  it('parses pages and clamps windows', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage(['2', '9'])).toBe(2)
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '9999999']) expect(parsePage(bad)).toBe(1)
    expect(pageWindow(45, 2, 20)).toEqual({ page: 2, pageCount: 3, skip: 20, take: 20 })
    expect(pageWindow(45, 99, 20)).toEqual({ page: 3, pageCount: 3, skip: 40, take: 20 })
    expect(pageWindow(0, 1, 20)).toEqual({ page: 1, pageCount: 1, skip: 0, take: 20 })
  })

  it('falls back to defaults for unknown tabs and filters', () => {
    expect(parseBetTab('settled')).toBe('settled')
    expect(parseBetTab('WON')).toBe('open')
    expect(parseBetTab(undefined)).toBe('open')
    expect(parseWalletFilter('payouts')).toBe('payouts')
    expect(parseWalletFilter(['bets'])).toBe('all')
    expect(parseWalletFilter('PAYOUT')).toBe('all')
  })
})
