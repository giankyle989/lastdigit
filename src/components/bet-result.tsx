import type { BetResult as Result } from '@prisma/client'

import { formatSplit } from '@/lib/format'
import { splitReturn } from '@/lib/funding'
import { cn } from '@/lib/utils'

/** "Won +₱210 + 100 pts" in accent for wins; muted for losses; plain for pending/refunded (spec §4.4). */
export function BetResult({
  result,
  payout,
  pointsStake,
}: {
  result: Result
  payout: number
  pointsStake: number
}) {
  return (
    <span
      className={cn(
        'num text-sm',
        result === 'WON' && 'text-primary font-semibold',
        result === 'LOST' && 'text-muted-foreground',
      )}
    >
      {result === 'WON'
        ? `Won ${formatSplit(splitReturn(payout, pointsStake), { signed: true })}`
        : result === 'LOST'
          ? 'Lost'
          : result === 'PENDING'
            ? 'Pending'
            : 'Refunded'}
    </span>
  )
}
