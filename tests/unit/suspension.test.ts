import { describe, expect, it } from 'vitest'
import { isSuspended } from '@/lib/suspension'

const now = new Date('2026-11-11T12:00:00Z')

describe('isSuspended', () => {
  it('active users are not suspended', () => {
    expect(isSuspended({ status: 'ACTIVE', suspendedUntil: null }, now)).toBe(false)
  })
  it('indefinite suspension', () => {
    expect(isSuspended({ status: 'SUSPENDED', suspendedUntil: null }, now)).toBe(true)
  })
  it('suspension until a future date', () => {
    expect(isSuspended({ status: 'SUSPENDED', suspendedUntil: new Date('2026-11-12T00:00:00Z') }, now)).toBe(true)
  })
  it('expired suspension counts as active', () => {
    expect(isSuspended({ status: 'SUSPENDED', suspendedUntil: new Date('2026-11-10T00:00:00Z') }, now)).toBe(false)
  })
})
