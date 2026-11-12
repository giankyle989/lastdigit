import { teamColor, teamTextColor } from '@/lib/teams'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-7 text-[10px]', md: 'size-9 text-xs', lg: 'size-12 text-sm' } as const

export function TeamBadge({ abbr, size = 'md' }: { abbr: string; size?: keyof typeof SIZES }) {
  const bg = teamColor(abbr)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold ring-1 ring-white/15',
        SIZES[size],
      )}
      style={{ backgroundColor: bg, color: teamTextColor(bg) }}
    >
      {abbr}
    </span>
  )
}
