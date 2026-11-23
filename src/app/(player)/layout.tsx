import { SlipBar, SlipColumn } from '@/components/bet-slip/slip-dock'
import { SlipProvider } from '@/components/bet-slip/slip-provider'
import { PlayerHeader } from '@/components/shell/player-header'
import { PlayerBottomNav } from '@/components/shell/player-nav'
import { requirePlayer } from '@/server/session'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlayer()
  return (
    <SlipProvider userId={user.id} wallet={user.walletBalance} points={user.pointsBalance}>
      <div className="min-h-dvh">
        <PlayerHeader wallet={user.walletBalance} points={user.pointsBalance} />
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-36 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-6 md:pb-10">
          <main className="min-w-0">{children}</main>
          <SlipColumn />
        </div>
        <SlipBar />
        <PlayerBottomNav />
      </div>
    </SlipProvider>
  )
}
