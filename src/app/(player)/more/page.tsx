import { ChevronRight, Gift, LifeBuoy } from 'lucide-react'
import Link from 'next/link'

import { LogoutButton } from '@/components/logout-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/server/session'

const LINKS = [
  { href: '/more/referral', label: 'Refer friends', icon: Gift },
  { href: '/more/support', label: 'Support', icon: LifeBuoy },
]

export default async function MorePage() {
  const user = await requireUser()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">More</h1>
      <ul className="bg-card border-border divide-border divide-y rounded-xl border">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:bg-surface-2 flex items-center gap-3 p-4">
              <l.icon aria-hidden className="text-primary size-5" />
              <span className="font-medium">{l.label}</span>
              <ChevronRight aria-hidden className="text-muted-foreground ml-auto size-4" />
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="text-muted-foreground text-xs">Signed in as</div>
            <div className="font-semibold">{user.username}</div>
          </div>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  )
}
