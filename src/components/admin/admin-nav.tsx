'use client'

import type { Role } from '@prisma/client'
import { BookOpen, Gamepad2, LayoutDashboard, LifeBuoy, Menu, Settings, UserCog, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { can, type Permission } from '@/lib/permissions'
import { isActivePath } from '@/lib/url'
import { cn } from '@/lib/utils'

export type AdminBadges = { openTickets: number; needsAttention: boolean }

const NAV: { href: string; label: string; icon: typeof Users; exact: boolean; permission: Permission }[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true, permission: 'console.view' },
  { href: '/admin/players', label: 'Players', icon: Users, exact: false, permission: 'console.view' },
  { href: '/admin/games', label: 'Games', icon: Gamepad2, exact: false, permission: 'console.view' },
  { href: '/admin/ledger', label: 'Ledger', icon: BookOpen, exact: false, permission: 'console.view' },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, exact: false, permission: 'console.view' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, exact: false, permission: 'settings.manage' },
  { href: '/admin/staff', label: 'Staff', icon: UserCog, exact: false, permission: 'staff.manage' },
]

export function adminNavItems(role: Role) {
  return NAV.filter((item) => can(role, item.permission))
}

function NavLinks({
  badges,
  role,
  onNavigate,
}: {
  badges: AdminBadges
  role: Role
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  return (
    <ul className="flex flex-col gap-1">
      {adminNavItems(role).map((item) => {
        const active = isActivePath(pathname, item.href, item.exact)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                active ? 'bg-surface-2 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
              {item.href === '/admin' && badges.needsAttention && (
                <>
                  <span aria-hidden className="bg-live ml-auto size-2 rounded-full" />
                  <span className="sr-only">(needs attention)</span>
                </>
              )}
              {item.href === '/admin/support' && badges.openTickets > 0 && (
                <span className="bg-live/15 text-live num ml-auto rounded-full px-2 text-xs">
                  {badges.openTickets}
                  <span className="sr-only"> open tickets</span>
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Left sidebar on ≥ 768px. */
export function AdminSidebar({ badges, role }: { badges: AdminBadges; role: Role }) {
  return (
    <aside className="border-border bg-surface sticky top-0 hidden h-dvh flex-col gap-6 border-r p-4 md:flex">
      <Link href="/admin" className="px-3 text-lg font-black tracking-tight">
        Last<span className="text-primary">Digit</span>{' '}
        <span className="text-muted-foreground text-xs">admin</span>
      </Link>
      <nav aria-label="Admin">
        <NavLinks badges={badges} role={role} />
      </nav>
    </aside>
  )
}

/** On phones the sidebar becomes a slide-out menu. */
export function AdminMobileNav({ badges, role }: { badges: AdminBadges; role: Role }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="data-[side=left]:w-64">
        <SheetHeader>
          <SheetTitle>Admin</SheetTitle>
          <SheetDescription className="sr-only">Admin sections</SheetDescription>
        </SheetHeader>
        <nav aria-label="Admin" className="px-2">
          <NavLinks badges={badges} role={role} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  )
}
