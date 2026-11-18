import { describe, expect, it } from 'vitest'

import { can, isStaff, type Permission, PERMISSIONS } from '@/lib/permissions'

const MANAGER_ALLOWED: Permission[] = ['console.view', 'points.adjust', 'players.manage', 'support.answer']

describe('permissions', () => {
  it.each(PERMISSIONS)('superadmin can %s', (p) => expect(can('SUPERADMIN', p)).toBe(true))
  it.each(PERMISSIONS)('player cannot %s', (p) => expect(can('PLAYER', p)).toBe(false))
  it.each(PERMISSIONS)('manager on %s matches the table', (p) =>
    expect(can('MANAGER', p)).toBe(MANAGER_ALLOWED.includes(p)),
  )
  it('lists exactly the seven permissions', () =>
    expect([...PERMISSIONS].sort()).toEqual(
      [
        'console.view',
        'games.manage',
        'players.manage',
        'points.adjust',
        'settings.manage',
        'staff.manage',
        'support.answer',
      ].sort(),
    ))
  it('isStaff', () => {
    expect(isStaff('SUPERADMIN')).toBe(true)
    expect(isStaff('MANAGER')).toBe(true)
    expect(isStaff('PLAYER')).toBe(false)
  })
})
