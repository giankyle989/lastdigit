import { redirect } from 'next/navigation'

import { isStaff } from '@/lib/permissions'
import { getCurrentUser } from '@/server/session'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(isStaff(user.role) ? '/admin' : '/games')
}
