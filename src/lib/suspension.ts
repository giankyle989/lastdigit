import type { UserStatus } from '@prisma/client'

export function isSuspended(
  u: { status: UserStatus; suspendedUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (u.status !== 'SUSPENDED') return false
  return u.suspendedUntil === null || u.suspendedUntil > now
}
