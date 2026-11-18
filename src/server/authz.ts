import type { User } from '@prisma/client'

import type { Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { can, type Permission } from '@/lib/permissions'
import { isSuspended } from '@/lib/suspension'

/** Loads the acting staff member and refuses unless their role grants `permission`. */
export async function assertCan(db: Tx, actorId: string, permission: Permission): Promise<User> {
  const actor = await db.user.findUnique({ where: { id: actorId } })
  if (!actor || isSuspended(actor) || !can(actor.role, permission)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to do that')
  }
  return actor
}
