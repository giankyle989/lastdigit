import Link from 'next/link'

import type { StripDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function DateStrip({ days, selected }: { days: StripDay[]; selected: string }) {
  return (
    <nav aria-label="Game day" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 pb-1">
        {days.map((d) => {
          const active = d.date === selected
          return (
            <li key={d.date}>
              <Link
                href={`/games?date=${d.date}`}
                aria-current={active ? 'date' : undefined}
                className={cn(
                  'block rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                )}
              >
                {d.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
