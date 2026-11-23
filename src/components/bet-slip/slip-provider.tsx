'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'

import { type BetAccount } from '@/lib/funding'
import {
  addBlockReason,
  EMPTY_SLIP,
  type NewPick,
  parseStoredSlip,
  type SlipPick,
  slipReducer,
  slipStorageKey,
} from '@/lib/slip'

type SlipContextValue = {
  picks: SlipPick[]
  lastStake: number
  /** Balance from the last server render; the slip refreshes it via getSlipStatusAction. */
  balance: number
  /** Points from the last server render; spent first. */
  points: number
  /** The player's chosen account for this slip; null until they choose. */
  account: BetAccount | null
  add: (pick: NewPick) => void
  /** Adds several picks at once, or none if the slip lacks room (multi-select spec §2.4). */
  addMany: (picks: SlipPick[], lastStake: number) => void
  remove: (index: number) => void
  setStake: (index: number, stake: number) => void
  addStake: (index: number, amount: number) => void
  setMax: (index: number, balance: number) => void
  clear: () => void
  /** Undo for clear: puts the picks back, but only while the slip is still empty. */
  restore: (picks: SlipPick[]) => void
  /** Removes the given picks (matched by game and ending), keeping any others. */
  removePicks: (picks: Omit<NewPick, 'matchup'>[]) => void
  /** Phone bottom-sheet state. */
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
}

const SlipContext = createContext<SlipContextValue | null>(null)

// localStorage can be missing or throw (private mode): the slip then lives in memory only (spec §7).
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch (e) {
    console.warn('bet slip: localStorage unavailable, keeping the slip in memory', e)
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch (e) {
    console.warn('bet slip: could not save the slip', e)
  }
}

export function SlipProvider({
  userId,
  balance,
  points,
  children,
}: {
  userId: string
  balance: number
  points: number
  children: React.ReactNode
}) {
  const key = slipStorageKey(userId)
  const [slip, dispatch] = useReducer(slipReducer, EMPTY_SLIP)
  const [loaded, setLoaded] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    dispatch({ type: 'load', slip: parseStoredSlip(readStorage(key)) })
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (loaded) writeStorage(key, JSON.stringify(slip))
  }, [key, loaded, slip])

  const add = useCallback(
    (pick: NewPick) => {
      const blocked = addBlockReason(slip, pick)
      if (blocked) {
        toast.error(blocked)
        return
      }
      dispatch({ type: 'add', pick })
      toast.success(`Added ${pick.matchup} ${pick.awayDigit}-${pick.homeDigit} to the slip`)
    },
    [slip],
  )

  const value = useMemo<SlipContextValue>(
    () => ({
      picks: slip.picks,
      lastStake: slip.lastStake,
      balance,
      points,
      account: slip.account,
      add,
      addMany: (picks, lastStake) => {
        dispatch({ type: 'addMany', picks, lastStake })
        toast.success(`${picks.length} ${picks.length === 1 ? 'ending' : 'endings'} added to the slip`)
      },
      remove: (index) => dispatch({ type: 'remove', index }),
      setStake: (index, stake) => dispatch({ type: 'setStake', index, stake }),
      addStake: (index, amount) => dispatch({ type: 'addStake', index, amount }),
      setMax: (index, bal) => dispatch({ type: 'setMax', index, balance: bal }),
      clear: () => dispatch({ type: 'clear' }),
      restore: (picks) => dispatch({ type: 'restore', picks }),
      removePicks: (picks) => dispatch({ type: 'removePicks', picks }),
      sheetOpen,
      setSheetOpen,
    }),
    [slip, balance, points, add, sheetOpen],
  )

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext)
  if (!ctx) throw new Error('useSlip must be used inside <SlipProvider>')
  return ctx
}
