import type { BetResult as Result } from '@prisma/client'

import { formatPoints } from '@/lib/format'
import { cn } from '@/lib/utils'

/** "+225" in accent for wins; muted for losses; plain for pending/refunded (spec §4.4). */
export function BetResult({ result, payout }: { result: Result; payout: number }) {
  return (
    <span
      className={cn(
        'num text-sm',
        result === 'WON' && 'text-primary font-semibold',
        result === 'LOST' && 'text-muted-foreground',
      )}
    >
      {result === 'WON'
        ? `Won +${formatPoints(payout)}`
        : result === 'LOST'
          ? 'Lost'
          : result === 'PENDING'
            ? 'Pending'
            : 'Refunded'}
    </span>
  )
}
