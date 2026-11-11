import { describe, expect, it } from 'vitest'

import { intFromForm } from '@/lib/validation'

const stake = intFromForm('Stake', 1, 1000)

describe('intFromForm', () => {
  it('accepts digit strings and numbers', () => {
    expect(stake.parse('25')).toBe(25)
    expect(stake.parse(' 25 ')).toBe(25)
    expect(stake.parse(25)).toBe(25)
  })
  it.each(['', '10.5', '-5', 'abc', '1e3', '0', '1001', null, undefined])('rejects %s', (v) => {
    const r = stake.safeParse(v)
    expect(r.success).toBe(false)
  })
  it('gives a readable message', () => {
    const r = stake.safeParse('abc')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Stake must be a whole number')
  })
})
