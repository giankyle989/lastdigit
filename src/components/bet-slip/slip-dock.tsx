'use client'

import { Ticket } from 'lucide-react'

import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { slipTotal } from '@/lib/slip'

import { BetSlipPanel } from './bet-slip-panel'
import { useSlip } from './slip-provider'

/** Desktop (≥ 768px): the slip as a sticky right column. */
export function SlipColumn() {
  return (
    <aside aria-label="Bet slip" className="hidden md:block">
      <Card className="sticky top-20">
        <CardHeader>
          <CardTitle>Bet slip</CardTitle>
        </CardHeader>
        <CardContent>
          <BetSlipPanel />
        </CardContent>
      </Card>
    </aside>
  )
}

/** Phone (< 768px): a bar above the tab bar while the slip has picks; opens a bottom sheet. */
export function SlipBar() {
  const slip = useSlip()
  const count = slip.picks.length
  return (
    <>
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 md:hidden">
          <button
            type="button"
            aria-label={`Open bet slip (${count} ${count === 1 ? 'pick' : 'picks'})`}
            onClick={() => slip.setSheetOpen(true)}
            className="bg-primary text-primary-foreground flex h-12 w-full items-center justify-between rounded-xl px-4 font-semibold shadow-lg"
          >
            <span className="flex items-center gap-2">
              <Ticket aria-hidden className="size-4" />
              Bet slip · {count}
            </span>
            <PointsAmount value={slipTotal(slip.picks)} unit />
          </button>
        </div>
      )}
      <Sheet open={slip.sheetOpen} onOpenChange={slip.setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto md:hidden">
          <SheetHeader>
            <SheetTitle>Bet slip</SheetTitle>
            <SheetDescription>Review your picks, then confirm them all at once.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <BetSlipPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
