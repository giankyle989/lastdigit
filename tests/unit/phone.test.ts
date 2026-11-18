import { describe, expect, it } from 'vitest'

import { formatPhPhone, parsePhPhone, PHONE_HINT, phoneSchema } from '@/lib/phone'

describe('parsePhPhone', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['0917 123 4567', '+639171234567'],
    ['0917-123-4567', '+639171234567'],
    [' +63 917 123 4567 ', '+639171234567'],
  ])('accepts %s', (input, expected) => {
    expect(parsePhPhone(input)).toBe(expected)
  })

  it.each([
    '',
    '0917123456', // too short
    '091712345678', // too long
    '08171234567', // not a mobile prefix
    '0281234567', // Manila landline
    '+6309171234567',
    '+19171234567',
    '0917a234567',
  ])('rejects %s', (input) => {
    expect(parsePhPhone(input)).toBeNull()
  })
})

describe('formatPhPhone', () => {
  it('shows the local form in groups', () => {
    expect(formatPhPhone('+639171234567')).toBe('0917 123 4567')
  })
})

describe('phoneSchema', () => {
  it('normalises valid input and explains invalid input', () => {
    expect(phoneSchema.parse('0917 123 4567')).toBe('+639171234567')
    const r = phoneSchema.safeParse('12345')
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(PHONE_HINT)
  })
})
