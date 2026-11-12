import { describe, expect, it } from 'vitest'

import { parseSuspendUntil } from '@/lib/suspend-until'

describe('parseSuspendUntil', () => {
  it('treats empty input as indefinite', () => {
    expect(parseSuspendUntil('')).toBeNull()
  })

  it('reads the date as 00:00 PHT', () => {
    expect(parseSuspendUntil('2026-11-12')).toEqual(new Date('2026-11-11T16:00:00Z'))
  })

  it('rejects invalid dates', () => {
    expect(parseSuspendUntil('2026-02-30')).toBe('invalid')
    expect(parseSuspendUntil('tomorrow')).toBe('invalid')
  })
})
