'use client'

import { X } from 'lucide-react'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { getSlipStatusAction, placeBetsAction } from '@/app/(player)/actions'
import { PointsAmount } from '@/components/points-amount'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEnding } from '@/lib/game/ending'
import {
  bestCaseReturn,
  estimatePickReturns,
  fundingLine,
  parseStakeInput,
  QUICK_STAKES,
  type SlipPick,
  slipTotal,
} from '@/lib/slip'
import { cn } from '@/lib/utils'

import { useSlip } from './slip-provider'

type PickKey = { gameId: string; awayDigit: number; homeDigit: number }
type PickStatusView = PickKey & { open: boolean; pool: number; endingStake: number }
type SlipStatusView = { walletBalance: number; pointsBalance: number; picks: PickStatusView[] }

const keyOf = (p: PickKey) => `${p.gameId}:${p.awayDigit}-${p.homeDigit}`
const toKeys = (picks: SlipPick[]): PickKey[] =>
  picks.map(({ gameId, awayDigit, homeDigit }) => ({ gameId, awayDigit, homeDigit }))

/** Bet slip contents: pick rows, totals and Confirm bets (spec §4.3). */
export function BetSlipPanel() {
  const slip = useSlip()
  const router = useRouter()
  const [status, setStatus] = useState<SlipStatusView | null>(null)
  const [failedIndex, setFailedIndex] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const picksRef = useRef(slip.picks)
  const listRef = useRef<HTMLUListElement>(null)
  // Picks removed by Clear all, kept for Undo. Undo lives in the slip, not a toast: the phone
  // sheet is modal, so a toast's button cannot be tapped while it is open.
  const [cleared, setCleared] = useState<SlipPick[] | null>(null)

  useEffect(() => {
    picksRef.current = slip.picks
    if (slip.picks.length > 0) setCleared(null)
    // Any edit (remove, stake change) moves rows around; drop the failure highlight.
    setFailedIndex(null)
  }, [slip.picks])

  // The picks list scrolls on its own; bring a rejected pick into view.
  useEffect(() => {
    if (failedIndex === null) return
    listRef.current?.children[failedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [failedIndex])

  // Fresh status whenever the slip opens (mounts) or the set of picks changes — not on stake edits.
  const pickKeys = slip.picks.map(keyOf).join('|')
  useEffect(() => {
    if (pickKeys === '') return
    let cancelled = false
    getSlipStatusAction(toKeys(picksRef.current))
      .then((fresh) => {
        if (!cancelled) setStatus(fresh)
      })
      .catch((e: unknown) => console.error('bet slip: status refresh failed', e))
    return () => {
      cancelled = true
    }
  }, [pickKeys])

  if (slip.picks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
        <p className="text-muted-foreground" role="status">
          {cleared ? 'Bet slip cleared.' : 'Your slip is empty. Pick an ending on a game to add it.'}
        </p>
        {cleared && (
          <Button type="button" variant="outline" size="sm" onClick={() => slip.restore(cleared)}>
            Undo
          </Button>
        )}
      </div>
    )
  }

  const statusByKey = new Map(status?.picks.map((s) => [keyOf(s), s]))
  const balance = status ? status.walletBalance + status.pointsBalance : slip.balance
  const points = status?.pointsBalance ?? slip.points
  const total = slipTotal(slip.picks)
  const funding = fundingLine(total, points)
  const anyClosed = slip.picks.some((p) => statusByKey.get(keyOf(p))?.open === false)
  const anyInvalid = slip.picks.some((p) => p.stake < 1)
  const returns = estimatePickReturns(slip.picks, (p) => statusByKey.get(keyOf(p)))
  const bestReturn = bestCaseReturn(slip.picks, returns)
  const count = slip.picks.length
  const disabled = pending || total > balance || anyClosed || anyInvalid

  function confirm() {
    startTransition(async () => {
      setFailedIndex(null)
      const picks = picksRef.current
      try {
        const fresh = await getSlipStatusAction(toKeys(picks))
        setStatus(fresh)
        if (fresh.picks.some((s) => !s.open)) {
          toast.error('Remove the picks marked "Betting closed" first')
          return
        }
        const result = await placeBetsAction(
          picks.map(({ gameId, awayDigit, homeDigit, stake }) => ({ gameId, awayDigit, homeDigit, stake })),
        )
        if (result.error) {
          setFailedIndex(result.pickIndex ?? null)
          toast.error(result.error)
          return
        }
        // Only the confirmed picks leave the slip; ones added meanwhile stay.
        slip.removePicks(toKeys(picks))
        setStatus(null)
        slip.setSheetOpen(false)
        toast.success(result.ok)
        router.refresh()
      } catch (e) {
        if (isRedirectError(e)) throw e
        console.error('bet slip: confirm failed', e)
        toast.error('Could not place bets. Try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          {count} {count === 1 ? 'pick' : 'picks'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setCleared(slip.picks)
            slip.clear()
          }}
          disabled={pending}
        >
          Clear all
        </Button>
      </div>
      {/* Only the picks scroll, so totals and Confirm bets stay in view. Focusable so keyboard
          users can scroll it even when every row's inputs are disabled. */}
      <ul
        ref={listRef}
        aria-label="Picks"
        tabIndex={0}
        className="-mr-1 flex max-h-[30dvh] flex-col gap-2 overflow-y-auto overscroll-contain pr-1 md:max-h-[min(26rem,45dvh)]"
      >
        {slip.picks.map((p, i) => {
          const s = statusByKey.get(keyOf(p))
          const closed = s?.open === false
          const label = `${p.matchup} ${formatEnding(p)}`
          return (
            <li
              key={keyOf(p)}
              aria-invalid={failedIndex === i || undefined}
              className={cn(
                'bg-surface-2 border-border rounded-lg border p-3',
                closed && 'opacity-60',
                failedIndex === i && 'border-danger ring-danger/40 ring-2',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{p.matchup}</div>
                  <div className="num text-primary text-lg font-semibold">{formatEnding(p)}</div>
                  {closed && <div className="text-live text-xs font-medium">Betting closed</div>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${label}`}
                  onClick={() => slip.remove(i)}
                  disabled={pending}
                >
                  <X />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  aria-label={`Stake for ${label}`}
                  className="num h-8 w-24"
                  value={p.stake === 0 ? '' : p.stake}
                  onChange={(e) => slip.setStake(i, parseStakeInput(e.target.value))}
                  disabled={closed || pending}
                />
                {QUICK_STAKES.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Add ${amount} to ${label}`}
                    onClick={() => slip.addStake(i, amount)}
                    disabled={closed || pending}
                  >
                    +{amount}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Max stake for ${label}`}
                  onClick={() => slip.setMax(i, balance)}
                  disabled={closed || pending}
                >
                  Max
                </Button>
              </div>
              {returns[i] != null && !closed && (
                <div className="text-muted-foreground mt-1 text-xs">
                  Est. return if it hits <PointsAmount value={returns[i]} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Total stake</dt>
        <dd className={cn('text-right', total > balance && 'text-danger')}>
          <PointsAmount value={total} unit />
        </dd>
        <dt className="text-muted-foreground">Available</dt>
        <dd className="text-right">
          <PointsAmount value={balance} unit />
        </dd>
        <dt className="text-muted-foreground">Est. max return</dt>
        <dd className="text-primary text-right">
          <PointsAmount value={bestReturn} unit />
        </dd>
      </dl>
      {funding && (
        <p className="text-muted-foreground text-xs" data-testid="slip-funding">
          {funding}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Only one ending per game can win, so this counts your best pick in each game. Estimate — changes as
        others bet.
      </p>
      <Button type="button" size="lg" className="w-full" disabled={disabled} onClick={confirm}>
        {pending ? 'Placing…' : 'Confirm bets'}
      </Button>
    </div>
  )
}
