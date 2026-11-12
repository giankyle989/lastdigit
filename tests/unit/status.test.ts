import { describe, expect, it } from 'vitest'

import { displayStatus, isBettingOpen } from '@/lib/game/status'

const tip = new Date('2026-11-12T00:00:00Z')
const before = new Date(tip.getTime() - 1)

describe('displayStatus', () => {
  it('shows SCHEDULED as OPEN before tip-off and CLOSED from tip-off on', () => {
    expect(displayStatus({ status: 'SCHEDULED', startsAt: tip }, before)).toBe('OPEN')
    expect(displayStatus({ status: 'SCHEDULED', startsAt: tip }, tip)).toBe('CLOSED')
  })

  it.each(['LIVE', 'FINAL', 'SETTLED', 'VOID', 'POSTPONED'] as const)('passes %s through', (status) => {
    expect(displayStatus({ status, startsAt: tip }, before)).toBe(status)
  })

  it('only SCHEDULED games before tip-off are open for bets', () => {
    expect(isBettingOpen({ status: 'SCHEDULED', startsAt: tip }, before)).toBe(true)
    expect(isBettingOpen({ status: 'SCHEDULED', startsAt: tip }, tip)).toBe(false)
    expect(isBettingOpen({ status: 'POSTPONED', startsAt: tip }, before)).toBe(false)
  })
})
