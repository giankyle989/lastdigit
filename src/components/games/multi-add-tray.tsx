'use client'

import { useState } from 'react'

import { useSlip } from '@/components/bet-slip/slip-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPoints } from '@/lib/format'
import {
  type Ending,
  parseStakeInput,
  parseTotalInput,
  planMultiAdd,
  QUICK_STAKES,
  type StakeMode,
} from '@/lib/slip'

type Props = {
  gameId: string
  matchup: string
  endings: Ending[]
  /** Called after the picks went into the slip; the parent clears its selection. */
  onAdded: () => void
  onClear: () => void
}

/** Count, stake mode, one stake and "Add N to slip" for the selected heatmap cells (spec §2.2–2.4). */
export function MultiAddTray({ gameId, matchup, endings, onAdded, onClear }: Props) {
  const slip = useSlip()
  const n = endings.length
  const [mode, setMode] = useState<StakeMode>('perEnding')
  // null = follow the default for the mode (last stake, or last stake × n) until the player types.
  const [typed, setTyped] = useState<number | null>(null)
  const stake = typed ?? (mode === 'perEnding' ? slip.lastStake : slip.lastStake * n)
  const plan = planMultiAdd({
    slip: { picks: slip.picks, lastStake: slip.lastStake },
    gameId,
    matchup,
    endings,
    mode,
    stake,
  })
  const each =
    plan.perEnding.min === plan.perEnding.max
      ? formatPoints(plan.perEnding.min)
      : `${formatPoints(plan.perEnding.min)}–${formatPoints(plan.perEnding.max)}`
  const cost =
    mode === 'perEnding'
      ? `${n} × ${formatPoints(stake)} = ${formatPoints(stake * n)} pts`
      : `${formatPoints(stake)} split → ${each} each`

  return (
    <div className="bg-surface-2 border-border space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span role="status" aria-live="polite" className="text-sm font-medium">
          {n} {n === 1 ? 'ending' : 'endings'} selected
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>

      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Stake mode</legend>
        {(
          [
            ['perEnding', 'Per ending'],
            ['splitTotal', 'Split total'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="stake-mode"
              value={value}
              checked={mode === value}
              onChange={() => {
                setMode(value)
                setTyped(null)
              }}
              className="accent-primary size-4"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={mode === 'perEnding' ? 'Stake per ending' : 'Total stake'}
          className="num h-9 w-28"
          value={stake === 0 ? '' : stake}
          onChange={(e) =>
            setTyped((mode === 'perEnding' ? parseStakeInput : parseTotalInput)(e.target.value))
          }
        />
        {QUICK_STAKES.map((amount) => (
          <Button
            key={amount}
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Add ${amount} to the stake`}
            onClick={() => setTyped(stake + amount)}
          >
            +{amount}
          </Button>
        ))}
      </div>

      <p className="num text-muted-foreground text-sm">{plan.blocked ? '–' : cost}</p>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={plan.blocked !== null}
        onClick={() => {
          slip.addMany(plan.picks, plan.lastStake)
          onAdded()
        }}
      >
        Add {n} to slip
      </Button>
      {plan.blocked && <p className="text-muted-foreground text-center text-xs">{plan.blocked}</p>}
    </div>
  )
}
