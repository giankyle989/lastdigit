import { Nav } from '@/components/nav'
import { requireUser } from '@/server/session'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const links = [
    { href: '/games', label: 'Games' },
    { href: '/bets', label: 'My bets' },
    { href: '/wallet', label: 'Wallet' },
    { href: '/referral', label: 'Referral' },
    { href: '/inquiries', label: 'Inquiries' },
    ...(user.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
  ]
  return (
    <>
      <Nav links={links} user={user} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  )
}
