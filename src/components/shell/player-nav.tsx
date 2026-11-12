'use client'

import { CalendarDays, Menu, Ticket, Wallet } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isActivePath } from '@/lib/url'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/games', label: 'Games', icon: CalendarDays },
  { href: '/bets', label: 'Bets', icon: Ticket },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/more', label: 'More', icon: Menu },
]

/** Inline tabs in the desktop top bar (≥ 768px). */
export function PlayerTopNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV.map((item) => {
        const active = isActivePath(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-surface-2 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Fixed bottom tab bar on phones (< 768px). */
export function PlayerBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Tabs"
      className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <item.icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
