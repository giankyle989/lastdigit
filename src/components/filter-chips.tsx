import Link from 'next/link'

import { cn } from '@/lib/utils'

export type Chip = { label: string; href: string; active: boolean; count?: number }

/** A row of link chips (tabs and filters driven by search params). */
export function FilterChips({ label, chips }: { label: string; chips: Chip[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 pb-1">
        {chips.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              aria-current={c.active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap',
                c.active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
              {c.count !== undefined && <span className="num text-xs">{c.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
