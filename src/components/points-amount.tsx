import { formatPoints, formatSignedPoints } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  value: number
  /** Show a leading + for positive values and color by sign (accent / danger). */
  signed?: boolean
  /** Append " pts". */
  unit?: boolean
  className?: string
}

export function PointsAmount({ value, signed = false, unit = false, className }: Props) {
  const tone = signed ? (value > 0 ? 'text-primary' : value < 0 ? 'text-danger' : '') : ''
  return (
    <span className={cn('num', tone, className)}>
      {signed ? formatSignedPoints(value) : formatPoints(value)}
      {unit && ' pts'}
    </span>
  )
}
