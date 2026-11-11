import { Nav } from '@/components/nav'
import { requireAdmin } from '@/server/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const links = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/players', label: 'Players' },
    { href: '/admin/games', label: 'Games' },
    { href: '/admin/transactions', label: 'Transactions' },
    { href: '/admin/inquiries', label: 'Inquiries' },
    { href: '/admin/settings', label: 'Settings' },
    { href: '/games', label: 'Player site' },
  ]
  return (
    <>
      <Nav links={links} user={admin} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  )
}
