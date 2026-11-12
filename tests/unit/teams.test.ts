import { describe, expect, it } from 'vitest'

import { FALLBACK_TEAM_COLOR, TEAM_COLORS, teamColor, teamTextColor } from '@/lib/teams'

describe('teams', () => {
  it('maps all 30 NBA teams to a hex color', () => {
    expect(Object.keys(TEAM_COLORS)).toHaveLength(30)
    for (const hex of Object.values(TEAM_COLORS)) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('looks up case-insensitively and falls back for unknown teams', () => {
    expect(teamColor('LAL')).toBe('#552583')
    expect(teamColor(' gsw ')).toBe('#1D428A')
    expect(teamColor('XYZ')).toBe(FALLBACK_TEAM_COLOR)
    expect(teamColor('')).toBe(FALLBACK_TEAM_COLOR)
  })

  it('picks readable badge text', () => {
    expect(teamTextColor('#C4CED4')).toBe('#0b0f14') // SAS silver
    expect(teamTextColor('#552583')).toBe('#ffffff')
    expect(teamTextColor('#000000')).toBe('#ffffff')
  })
})
