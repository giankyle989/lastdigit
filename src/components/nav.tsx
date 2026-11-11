import Link from 'next/link'
import { logoutAction } from '@/app/(auth)/actions'
import { formatPoints } from '@/lib/format'

export function Nav({
  links,
  user,
}: {
  links: { href: string; label: string }[]
  user: { username: string; balance: number }
}) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-orange-600">
          LastDigit
        </Link>
        <nav className="flex flex-wrap gap-3 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-orange-600">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span>
            {user.username} · <strong>{formatPoints(user.balance)}</strong> pts
          </span>
          <form action={logoutAction}>
            <button className="btn-secondary">Log out</button>
          </form>
        </div>
      </div>
    </header>
  )
}
