import Link from 'next/link'

import { Amount } from '@/components/amount'
import { formatAmount } from '@/lib/format'

import { PlayerTopNav } from './player-nav'

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="text-lg font-black tracking-tight">
      Last<span className="text-primary">Digit</span>
    </Link>
  )
}

export function PlayerHeader({ wallet, points }: { wallet: number; points: number }) {
  return (
    <header className="bg-background/95 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Logo href="/games" />
        <PlayerTopNav />
        <div className="ml-auto flex items-center gap-2">
          {/* The accessible name starts with the visible figures (WCAG 2.5.3), then the split. */}
          <Link
            href="/wallet"
            className="bg-surface-2 border-border hover:border-primary/60 rounded-full border px-3 py-1 text-sm"
          >
            <Amount kind="wallet" value={wallet} className="text-primary font-semibold" />
            <span className="text-muted-foreground"> · </span>
            <Amount kind="points" value={points} />
            <span className="sr-only">
              {' '}
              (wallet {formatAmount('wallet', wallet)}, points {formatAmount('points', points)})
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}
