import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
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

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/')
  return user
}
