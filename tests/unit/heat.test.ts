import { describe, expect, it } from 'vitest'

import { heatLevel, maxCell } from '@/lib/game/heat'

describe('heatLevel', () => {
  it('maps stakes to 5 shades relative to the busiest ending', () => {
    expect(heatLevel(0, 1000)).toBe(0)
    expect(heatLevel(1, 1000)).toBe(1)
    expect(heatLevel(250, 1000)).toBe(1)
    expect(heatLevel(251, 1000)).toBe(2)
    expect(heatLevel(500, 1000)).toBe(2)
    expect(heatLevel(750, 1000)).toBe(3)
    expect(heatLevel(751, 1000)).toBe(4)
    expect(heatLevel(1000, 1000)).toBe(4)
  })

  it('handles empty pools', () => {
    expect(heatLevel(0, 0)).toBe(0)
    expect(maxCell([])).toBe(0)
    expect(
      maxCell([
        [0, 3],
        [7, 1],
      ]),
    ).toBe(7)
  })
})
