import type { DisplayStatus } from '@/lib/game/status'
import { cn } from '@/lib/utils'

const STYLES: Record<DisplayStatus, string> = {
  OPEN: 'bg-primary/15 text-primary',
  CLOSED: 'bg-surface-2 text-muted-foreground',
  LIVE: 'bg-live/15 text-live',
  FINAL: 'bg-surface-2 text-foreground',
  SETTLED: 'bg-surface-2 text-muted-foreground',
  VOID: 'bg-danger/15 text-danger',
  POSTPONED: 'bg-live/15 text-live',
}

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        STYLES[status],
      )}
    >
      {status === 'LIVE' && <span aria-hidden className="bg-live size-1.5 animate-pulse rounded-full" />}
      {status}
    </span>
  )
}
