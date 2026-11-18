import type { Role } from '@prisma/client'

export const PERMISSIONS = [
  'console.view',
  'points.adjust',
  'players.manage',
  'support.answer',
  'games.manage',
  'settings.manage',
  'staff.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const MANAGER_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'console.view',
  'points.adjust',
  'players.manage',
  'support.answer',
])

/** Managers and superadmins: anyone allowed into the admin console. */
export function isStaff(role: Role): boolean {
  return role === 'MANAGER' || role === 'SUPERADMIN'
}

export function can(role: Role, permission: Permission): boolean {
  if (role === 'SUPERADMIN') return true
  if (role === 'MANAGER') return MANAGER_PERMISSIONS.has(permission)
  return false
}
