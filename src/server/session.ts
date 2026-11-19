import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { can, isStaff, type Permission } from '@/lib/permissions'
import { isSuspended } from '@/lib/suspension'

/** Loads the user fresh from the DB on every request, so suspensions apply immediately. */
export async function getCurrentUser() {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || isSuspended(user)) return null
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/** The player side: staff accounts have no player pages and are sent to the console. */
export async function requirePlayer() {
  const user = await requireUser()
  if (isStaff(user.role)) redirect('/admin')
  return user
}

export async function requireAdmin(permission: Permission = 'console.view') {
  const user = await requireUser()
  if (!isStaff(user.role)) redirect('/')
  if (!can(user.role, permission)) redirect('/admin')
  return user
}
