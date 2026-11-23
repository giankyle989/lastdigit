import { type AmountKind, formatAmount, formatSplit } from '@/lib/format'
import { cn } from '@/lib/utils'

type Common = {
  /** Leading + for positive values, colored by sign (accent / danger). */
  signed?: boolean
  className?: string
}

function tone(signed: boolean, value: number): string {
  if (!signed) return ''
  return value > 0 ? 'text-primary' : value < 0 ? 'text-danger' : ''
}

/** An amount in its unit: ₱ for wallet, pts for points, plain for pools. */
export function Amount({
  kind,
  value,
  signed = false,
  className,
}: Common & { kind: AmountKind; value: number }) {
  return (
    <span className={cn('num', tone(signed, value), className)}>{formatAmount(kind, value, { signed })}</span>
  )
}

/** A wallet + points amount, wallet first ("₱60 + 40 pts"). */
export function SplitAmount({
  wallet,
  points,
  signed = false,
  className,
}: Common & { wallet: number; points: number }) {
  return (
    <span className={cn('num', tone(signed, wallet + points), className)}>
      {formatSplit({ wallet, points }, { signed })}
    </span>
  )
}
