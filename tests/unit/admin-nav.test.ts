import { describe, expect, it } from 'vitest'

import { adminNavItems } from '@/components/admin/admin-nav'

const labels = (role: 'MANAGER' | 'SUPERADMIN') => adminNavItems(role).map((i) => i.label)

describe('admin nav', () => {
  it('managers see no Settings or Staff', () =>
    expect(labels('MANAGER')).toEqual(['Overview', 'Players', 'Games', 'Ledger', 'Support']))
  it('superadmins see everything', () =>
    expect(labels('SUPERADMIN')).toEqual([
      'Overview',
      'Players',
      'Games',
      'Ledger',
      'Support',
      'Settings',
      'Staff',
    ]))
})
