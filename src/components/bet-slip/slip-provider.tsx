'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'

import { MAX_SLIP_PICKS } from '@/lib/game/limits'
import {
  canAdd,
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
  add: (pick: NewPick) => void
  remove: (index: number) => void
  setStake: (index: number, stake: number) => void
  addStake: (index: number, amount: number) => void
  setMax: (index: number, balance: number) => void
  clear: () => void
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
  children,
}: {
  userId: string
  balance: number
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
      if (!canAdd(slip, pick)) {
        toast.error(`The slip holds at most ${MAX_SLIP_PICKS} picks`)
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
      add,
      remove: (index) => dispatch({ type: 'remove', index }),
      setStake: (index, stake) => dispatch({ type: 'setStake', index, stake }),
      addStake: (index, amount) => dispatch({ type: 'addStake', index, amount }),
      setMax: (index, bal) => dispatch({ type: 'setMax', index, balance: bal }),
      clear: () => dispatch({ type: 'clear' }),
      sheetOpen,
      setSheetOpen,
    }),
    [slip, balance, add, sheetOpen],
  )

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext)
  if (!ctx) throw new Error('useSlip must be used inside <SlipProvider>')
  return ctx
}
