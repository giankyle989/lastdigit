import Link from 'next/link'

import { PointsAmount } from '@/components/points-amount'
import { formatPoints } from '@/lib/format'

import { PlayerTopNav } from './player-nav'

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="text-lg font-black tracking-tight">
      Last<span className="text-primary">Digit</span>
    </Link>
  )
}

export function PlayerHeader({ balance, isAdmin }: { balance: number; isAdmin: boolean }) {
  return (
    <header className="bg-background/95 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Logo href="/games" />
        <PlayerTopNav />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
              Admin
            </Link>
          )}
          <Link
            href="/wallet"
            aria-label={`Balance: ${formatPoints(balance)} points`}
            className="bg-surface-2 border-border hover:border-primary/60 rounded-full border px-3 py-1 text-sm"
          >
            <PointsAmount value={balance} unit className="text-primary font-semibold" />
          </Link>
        </div>
      </div>
    </header>
  )
}
