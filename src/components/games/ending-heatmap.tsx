import { Check } from 'lucide-react'

import { formatPoints } from '@/lib/format'
import { heatLevel, maxCell } from '@/lib/game/heat'
import { endingKey } from '@/lib/slip'
import { cn } from '@/lib/utils'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const SHADES = [
  'bg-surface-2 text-muted-foreground',
  'bg-primary/15 text-foreground',
  'bg-primary/35 text-foreground',
  'bg-primary/60 text-primary-foreground',
  'bg-primary text-primary-foreground',
] as const

type Props = {
  awayTeam: string
  homeTeam: string
  /** cells[awayDigit][homeDigit] = points staked. */
  cells: number[][]
  selected?: { awayDigit: number; homeDigit: number } | null
  winning?: { awayDigit: number; homeDigit: number } | null
  /** Omit for a read-only map (admin drawer, closed games). */
  onSelect?: (awayDigit: number, homeDigit: number) => void
  /** Multi-select: keys from endingKey() that are currently selected. */
  selectedKeys?: ReadonlySet<string>
  /** Multi-select: tapping a cell toggles it. Takes precedence over onSelect. */
  onToggle?: (awayDigit: number, homeDigit: number) => void
}

/** 10×10 pool map: rows = away digit, columns = home digit, 5 shades by stake (spec §4.2). */
export function EndingHeatmap({
  awayTeam,
  homeTeam,
  cells,
  selected,
  winning,
  onSelect,
  selectedKeys,
  onToggle,
}: Props) {
  const max = maxCell(cells)
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <caption className="text-muted-foreground mb-1 text-left text-xs">
          Rows: {awayTeam} last digit · Columns: {homeTeam} last digit
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              {awayTeam} digit
            </th>
            {DIGITS.map((h) => (
              <th key={h} scope="col" className="num text-muted-foreground w-8 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIGITS.map((a) => (
            <tr key={a}>
              <th scope="row" className="num text-muted-foreground pr-1 font-normal">
                {a}
              </th>
              {DIGITS.map((h) => {
                const stake = cells[a]?.[h] ?? 0
                const label = `Ending ${a}-${h}, ${formatPoints(stake)} staked`
                const isSelected = onToggle
                  ? (selectedKeys?.has(endingKey({ awayDigit: a, homeDigit: h })) ?? false)
                  : selected?.awayDigit === a && selected.homeDigit === h
                const isWinning = winning?.awayDigit === a && winning.homeDigit === h
                const onPress = onToggle ?? onSelect
                const className = cn(
                  'num relative flex size-8 items-center justify-center rounded-md',
                  SHADES[heatLevel(stake, max)],
                  isSelected && 'ring-foreground ring-2',
                  isWinning && 'ring-live ring-2',
                )
                return (
                  <td key={h} className="p-0">
                    {onPress ? (
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={isSelected}
                        onClick={() => onPress(a, h)}
                        className={className}
                      >
                        {stake > 0 ? compact(stake) : ''}
                        {onToggle && isSelected && (
                          <Check
                            aria-hidden
                            className="bg-foreground text-background absolute -top-1 -right-1 size-3 rounded-full p-px"
                          />
                        )}
                      </button>
                    ) : (
                      <span role="img" aria-label={label} className={className}>
                        {stake > 0 ? compact(stake) : ''}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function compact(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n)
}
