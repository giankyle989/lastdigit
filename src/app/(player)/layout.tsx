import { PlayerHeader } from '@/components/shell/player-header'
import { PlayerBottomNav } from '@/components/shell/player-nav'
import { requireUser } from '@/server/session'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="min-h-dvh">
      <PlayerHeader balance={user.balance} isAdmin={user.role === 'ADMIN'} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28 md:pb-10">{children}</main>
      <PlayerBottomNav />
    </div>
  )
}
