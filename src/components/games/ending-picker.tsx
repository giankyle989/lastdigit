'use client'

import { useState } from 'react'

import { useSlip } from '@/components/bet-slip/slip-provider'
import { PointsAmount } from '@/components/points-amount'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { estimatePayout } from '@/lib/game/payout'

import { DigitPicker } from './digit-picker'
import { EndingHeatmap } from './ending-heatmap'

type Props = {
  gameId: string
  awayTeam: string
  homeTeam: string
  open: boolean
  pool: number
  cells: number[][]
}

/** Pickers / Heatmap toggle, the selected-ending panel and Add to slip (spec §4.2). */
export function EndingPicker({ gameId, awayTeam, homeTeam, open, pool, cells }: Props) {
  const slip = useSlip()
  const [away, setAway] = useState<number | null>(null)
  const [home, setHome] = useState<number | null>(null)
  const selected = away !== null && home !== null ? { awayDigit: away, homeDigit: home } : null
  const endingStake = selected ? (cells[selected.awayDigit]?.[selected.homeDigit] ?? 0) : 0

  return (
    <div className="space-y-4">
      <Tabs defaultValue="pickers">
        <TabsList aria-label="Pick mode">
          <TabsTrigger value="pickers">Pickers</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
        </TabsList>
        <TabsContent value="pickers" className="space-y-4 pt-3">
          <DigitPicker team={awayTeam} value={away} onChange={setAway} disabled={!open} />
          <DigitPicker team={homeTeam} value={home} onChange={setHome} disabled={!open} />
        </TabsContent>
        <TabsContent value="heatmap" className="pt-3">
          <EndingHeatmap
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            cells={cells}
            selected={selected}
            onSelect={
              open
                ? (a, h) => {
                    setAway(a)
                    setHome(h)
                  }
                : undefined
            }
          />
        </TabsContent>
      </Tabs>

      <div className="bg-surface-2 border-border rounded-lg border p-3" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-xs">Selected ending</span>
          <span className="num text-primary text-2xl font-bold">
            {selected ? `${selected.awayDigit}-${selected.homeDigit}` : '–'}
          </span>
        </div>
        {selected && (
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Staked on this ending</dt>
            <dd className="text-right">
              <PointsAmount value={endingStake} unit />
            </dd>
            <dt className="text-muted-foreground">Est. payout per 100 staked</dt>
            <dd className="text-primary text-right">
              <PointsAmount value={estimatePayout(pool, endingStake, 100)} unit />
            </dd>
          </dl>
        )}
        <p className="text-muted-foreground mt-2 text-xs">Estimate — changes as others bet</p>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!open || !selected}
        onClick={() => {
          if (selected) slip.add({ gameId, ...selected, matchup: `${awayTeam} @ ${homeTeam}` })
        }}
      >
        {open ? 'Add to slip' : 'Betting closed'}
      </Button>
      {open && (
        <p className="text-muted-foreground text-center text-xs">
          Adds at your last stake: <PointsAmount value={slip.lastStake} unit />
        </p>
      )}
    </div>
  )
}
