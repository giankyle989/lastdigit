'use client'

import { useState } from 'react'

import { useSlip } from '@/components/bet-slip/slip-provider'
import { PointsAmount } from '@/components/points-amount'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { estimatePayout } from '@/lib/game/payout'
import { type Ending, endingKey } from '@/lib/slip'

import { DigitPicker } from './digit-picker'
import { EndingHeatmap } from './ending-heatmap'
import { MultiAddTray } from './multi-add-tray'

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
  const [tab, setTab] = useState<'pickers' | 'heatmap'>('pickers')
  const [multi, setMulti] = useState<Map<string, Ending>>(new Map())
  const [lastTapped, setLastTapped] = useState<Ending | null>(null)
  const selectedKeys = open ? new Set(multi.keys()) : new Set<string>()
  const toggle = (awayDigit: number, homeDigit: number) => {
    const e = { awayDigit, homeDigit }
    setMulti((prev) => {
      const next = new Map(prev)
      if (next.has(endingKey(e))) next.delete(endingKey(e))
      else next.set(endingKey(e), e)
      return next
    })
    setLastTapped(e)
  }
  const clearMulti = () => {
    setMulti(new Map())
    setLastTapped(null)
  }
  const pickerSelected = away !== null && home !== null ? { awayDigit: away, homeDigit: home } : null
  const selected = tab === 'heatmap' ? (selectedKeys.size > 0 ? lastTapped : null) : pickerSelected
  const endingStake = selected ? (cells[selected.awayDigit]?.[selected.homeDigit] ?? 0) : 0

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v === 'heatmap' ? 'heatmap' : 'pickers')}>
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
            selectedKeys={selectedKeys}
            onToggle={open ? toggle : undefined}
          />
        </TabsContent>
      </Tabs>

      {tab === 'heatmap' && open && selectedKeys.size > 0 && (
        <MultiAddTray
          gameId={gameId}
          matchup={`${awayTeam} @ ${homeTeam}`}
          endings={[...multi.values()]}
          onAdded={clearMulti}
          onClear={clearMulti}
        />
      )}

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

      {(tab === 'pickers' || !open) && (
        <>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!open || !pickerSelected}
            onClick={() => {
              if (pickerSelected)
                slip.add({ gameId, ...pickerSelected, matchup: `${awayTeam} @ ${homeTeam}` })
            }}
          >
            {open ? 'Add to slip' : 'Betting closed'}
          </Button>
          {open && (
            <p className="text-muted-foreground text-center text-xs">
              Adds at your last stake: <PointsAmount value={slip.lastStake} unit />
            </p>
          )}
        </>
      )}
    </div>
  )
}
