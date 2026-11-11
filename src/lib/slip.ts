import { z } from 'zod'

import { MAX_SLIP_PICKS, MAX_STAKE } from './game/limits'

export const DEFAULT_STAKE = 100
export const QUICK_STAKES = [10, 50, 100] as const

export type SlipPick = {
  gameId: string
  awayDigit: number
  homeDigit: number
  stake: number
  /** "LAL @ GSW", for display only; never sent to the server. */
  matchup: string
}
export type NewPick = Omit<SlipPick, 'stake'>
export type Slip = { picks: SlipPick[]; lastStake: number }

export type SlipAction =
  | { type: 'add'; pick: NewPick }
  | { type: 'remove'; index: number }
  | { type: 'setStake'; index: number; stake: number }
  | { type: 'addStake'; index: number; amount: number }
  | { type: 'setMax'; index: number; balance: number }
  | { type: 'removePicks'; picks: Omit<NewPick, 'matchup'>[] }
  | { type: 'clear' }
  | { type: 'load'; slip: Slip }

export const EMPTY_SLIP: Slip = { picks: [], lastStake: DEFAULT_STAKE }

export function samePick(a: Omit<NewPick, 'matchup'>, b: Omit<NewPick, 'matchup'>): boolean {
  return a.gameId === b.gameId && a.awayDigit === b.awayDigit && a.homeDigit === b.homeDigit
}

/** False only when the pick is new and the slip already holds MAX_SLIP_PICKS. */
export function canAdd(slip: Slip, pick: NewPick): boolean {
  return slip.picks.some((p) => samePick(p, pick)) || slip.picks.length < MAX_SLIP_PICKS
}

export function slipTotal(picks: SlipPick[]): number {
  return picks.reduce((sum, p) => sum + p.stake, 0)
}

/** Max = balance minus the other picks' stakes, never below 0 (spec §4.3). */
export function maxStakeFor(picks: SlipPick[], index: number, balance: number): number {
  const others = picks.reduce((sum, p, i) => (i === index ? sum : sum + p.stake), 0)
  return Math.max(0, Math.min(MAX_STAKE, balance - others))
}

/** Stake input text → whole number in [0, MAX_STAKE]; anything that is not digits is 0. */
export function parseStakeInput(text: string): number {
  const t = text.trim()
  return /^\d{1,10}$/.test(t) ? Math.min(MAX_STAKE, Number(t)) : 0
}

function updateAt(slip: Slip, index: number, stake: number, remember: boolean): Slip {
  if (!slip.picks[index]) return slip
  const clamped = Math.max(0, Math.min(MAX_STAKE, Math.floor(stake)))
  return {
    picks: slip.picks.map((p, i) => (i === index ? { ...p, stake: clamped } : p)),
    lastStake: remember && clamped >= 1 ? clamped : slip.lastStake,
  }
}

export function slipReducer(slip: Slip, action: SlipAction): Slip {
  switch (action.type) {
    case 'add': {
      const at = slip.picks.findIndex((p) => samePick(p, action.pick))
      if (at >= 0) return updateAt(slip, at, (slip.picks[at]?.stake ?? 0) + slip.lastStake, false)
      if (slip.picks.length >= MAX_SLIP_PICKS) return slip
      return { ...slip, picks: [...slip.picks, { ...action.pick, stake: slip.lastStake }] }
    }
    case 'remove':
      return { ...slip, picks: slip.picks.filter((_, i) => i !== action.index) }
    case 'setStake':
      return updateAt(slip, action.index, action.stake, true)
    case 'addStake':
      return updateAt(slip, action.index, (slip.picks[action.index]?.stake ?? 0) + action.amount, true)
    case 'setMax':
      return updateAt(slip, action.index, maxStakeFor(slip.picks, action.index, action.balance), false)
    case 'removePicks':
      return { ...slip, picks: slip.picks.filter((p) => !action.picks.some((r) => samePick(p, r))) }
    case 'clear':
      return { ...slip, picks: [] }
    case 'load':
      return action.slip
  }
}

export function slipStorageKey(userId: string): string {
  return `lastdigit.slip.${userId}`
}

const storedSlipSchema = z.object({
  picks: z
    .array(
      z.object({
        gameId: z.string().min(1).max(64),
        awayDigit: z.number().int().min(0).max(9),
        homeDigit: z.number().int().min(0).max(9),
        stake: z.number().int().min(0).max(MAX_STAKE),
        matchup: z.string().max(40),
      }),
    )
    .max(MAX_SLIP_PICKS),
  lastStake: z.number().int().min(1).max(MAX_STAKE),
})

/** A saved slip, or an empty one when the value is missing or cannot be parsed (spec §4.3). */
export function parseStoredSlip(raw: string | null): Slip {
  if (!raw) return EMPTY_SLIP
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (e) {
    console.warn('bet slip: ignoring unreadable saved slip', e)
    return EMPTY_SLIP
  }
  const parsed = storedSlipSchema.safeParse(data)
  return parsed.success ? parsed.data : EMPTY_SLIP
}
