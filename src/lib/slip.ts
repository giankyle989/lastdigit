import { z } from 'zod'

import { formatAmount } from './format'
import {
  availableFor,
  type Balances,
  type BetAccount,
  type Funding,
  notEnoughMessage,
  otherAccount,
} from './funding'
import { endingLimitMessage, MAX_ENDINGS_PER_GAME, MAX_SLIP_PICKS, MAX_STAKE } from './game/limits'
import { estimatePayout } from './game/payout'

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
export type Slip = { picks: SlipPick[]; lastStake: number; account: BetAccount | null }
export type Ending = { awayDigit: number; homeDigit: number }
export type StakeMode = 'perEnding' | 'splitTotal'

export type SlipAction =
  | { type: 'add'; pick: NewPick }
  | { type: 'remove'; index: number }
  | { type: 'setStake'; index: number; stake: number }
  | { type: 'addStake'; index: number; amount: number }
  | { type: 'setMax'; index: number; balance: number }
  | { type: 'removePicks'; picks: Omit<NewPick, 'matchup'>[] }
  | { type: 'addMany'; picks: SlipPick[]; lastStake: number }
  | { type: 'setAccount'; account: BetAccount }
  | { type: 'clear' }
  /** Undo for clear: puts picks back, but only into a slip that is still empty. */
  | { type: 'restore'; picks: SlipPick[] }
  | { type: 'load'; slip: Slip }

export const EMPTY_SLIP: Slip = { picks: [], lastStake: DEFAULT_STAKE, account: null }

export function samePick(a: Omit<NewPick, 'matchup'>, b: Omit<NewPick, 'matchup'>): boolean {
  return a.gameId === b.gameId && a.awayDigit === b.awayDigit && a.homeDigit === b.homeDigit
}

/** Endings the slip can still take on this game (bets already placed are checked by the server). */
export function gameRoom(slip: Slip, gameId: string): number {
  return Math.max(0, MAX_ENDINGS_PER_GAME - slip.picks.filter((p) => p.gameId === gameId).length)
}

/** Why a single pick can't be added, or null. A pick already in the slip always merges. */
export function addBlockReason(slip: Slip, pick: NewPick): string | null {
  if (slip.picks.some((p) => samePick(p, pick))) return null
  if (slip.picks.length >= MAX_SLIP_PICKS) return `The slip holds at most ${MAX_SLIP_PICKS} picks`
  if (gameRoom(slip, pick.gameId) === 0) return endingLimitMessage(0)
  return null
}

export function canAdd(slip: Slip, pick: NewPick): boolean {
  return addBlockReason(slip, pick) === null
}

export function slipTotal(picks: SlipPick[]): number {
  return picks.reduce((sum, p) => sum + p.stake, 0)
}

export function endingKey(e: Ending): string {
  return `${e.awayDigit}-${e.homeDigit}`
}

/** `total` over `n` endings: floor(total / n) each, the first `total mod n` get one more. */
export function splitStake(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(total) || total < n) {
    throw new Error(`splitStake: cannot split ${total} over ${n}`)
  }
  const base = Math.floor(total / n)
  const extra = total % n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}

export function slipRoom(slip: Slip): number {
  return Math.max(0, MAX_SLIP_PICKS - slip.picks.length)
}

/** How many of `picks` are endings the slip does not hold yet (merges need no room). */
export function newPickCount(slip: Slip, picks: Omit<NewPick, 'matchup'>[]): number {
  return picks.filter((p) => !slip.picks.some((q) => samePick(p, q))).length
}

export type MultiAddPlan = {
  /** In grid order (away digit, then home digit). */
  picks: SlipPick[]
  total: number
  perEnding: { min: number; max: number }
  lastStake: number
  /** Why Add is disabled, or null when it can go ahead. */
  blocked: string | null
}

/** What "Add N to slip" would do for these endings, stake mode and stake (multi-select spec §2). */
export function planMultiAdd(input: {
  slip: Slip
  gameId: string
  matchup: string
  endings: Ending[]
  mode: StakeMode
  stake: number
}): MultiAddPlan {
  const { slip, gameId, matchup, mode, stake } = input
  const endings = [...input.endings].sort((a, b) => a.awayDigit - b.awayDigit || a.homeDigit - b.homeDigit)
  const n = endings.length
  const empty = (blocked: string): MultiAddPlan => ({
    picks: [],
    total: mode === 'perEnding' ? stake * n : stake,
    perEnding: { min: 0, max: 0 },
    lastStake: slip.lastStake,
    blocked,
  })

  if (n === 0) return empty('Select at least one ending')
  if (!(stake > 0)) return empty('Enter a stake')
  if (mode === 'splitTotal' && stake < n) return empty('At least 1 per ending')
  if (stake > (mode === 'perEnding' ? MAX_STAKE : n * MAX_STAKE)) {
    return empty(`At most ${formatAmount('pool', MAX_STAKE)} per ending`)
  }

  const stakes = mode === 'perEnding' ? endings.map(() => stake) : splitStake(stake, n)
  const picks = endings.map((e, i) => ({ gameId, matchup, ...e, stake: stakes[i] ?? 0 }))
  const min = Math.min(...stakes)
  const max = Math.max(...stakes)
  const room = slipRoom(slip)
  const fresh = newPickCount(slip, picks)
  const left = gameRoom(slip, gameId)
  return {
    picks,
    total: stakes.reduce((sum, x) => sum + x, 0),
    perEnding: { min, max },
    lastStake: min,
    blocked:
      fresh > room
        ? `The slip has room for ${room} more ${room === 1 ? 'ending' : 'endings'}`
        : fresh > left
          ? endingLimitMessage(left)
          : null,
  }
}

/** True when adding `picks` would push some game past MAX_ENDINGS_PER_GAME in the slip. */
function overGameRoom(slip: Slip, picks: Omit<NewPick, 'matchup'>[]): boolean {
  const fresh = new Map<string, number>()
  for (const p of picks) {
    if (!slip.picks.some((q) => samePick(p, q))) fresh.set(p.gameId, (fresh.get(p.gameId) ?? 0) + 1)
  }
  return [...fresh].some(([gameId, n]) => n > gameRoom(slip, gameId))
}

/** Max = balance minus the other picks' stakes, never below 0 (spec §4.3). */
export type PoolView = { pool: number; endingStake: number }

/**
 * Est. return of each pick if its ending wins, or null while its pool is unknown. Only one ending
 * per game can win, so the player's other picks on that game would lose and join its pool.
 */
export function estimatePickReturns(
  picks: SlipPick[],
  poolOf: (p: SlipPick) => PoolView | undefined,
): (number | null)[] {
  const stakeByGame = new Map<string, number>()
  for (const p of picks) stakeByGame.set(p.gameId, (stakeByGame.get(p.gameId) ?? 0) + p.stake)
  return picks.map((p) => {
    const view = poolOf(p)
    if (!view) return null
    const otherStakes = (stakeByGame.get(p.gameId) ?? 0) - p.stake
    return estimatePayout(view.pool + otherStakes, view.endingStake, p.stake)
  })
}

/** Best case for the whole slip: one ending wins per game, so the best pick of each game. */
export function bestCaseReturn(picks: SlipPick[], returns: (number | null)[]): number {
  const best = new Map<string, number>()
  picks.forEach((p, i) => {
    const r = returns[i]
    if (r != null) best.set(p.gameId, Math.max(best.get(p.gameId) ?? 0, r))
  })
  let sum = 0
  for (const r of best.values()) sum += r
  return sum
}

export function maxStakeFor(picks: SlipPick[], index: number, balance: number): number {
  const others = picks.reduce((sum, p, i) => (i === index ? sum : sum + p.stake), 0)
  return Math.max(0, Math.min(MAX_STAKE, balance - others))
}

/** Stake input text → whole number in [0, MAX_STAKE]; anything that is not digits is 0. */
export function parseStakeInput(text: string): number {
  const t = text.trim()
  return /^\d{1,10}$/.test(t) ? Math.min(MAX_STAKE, Number(t)) : 0
}

/** Split-total input text → whole number; no cap here, planMultiAdd enforces n × MAX_STAKE. */
export function parseTotalInput(text: string): number {
  const t = text.trim()
  return /^\d{1,10}$/.test(t) ? Number(t) : 0
}

function updateAt(slip: Slip, index: number, stake: number, remember: boolean): Slip {
  if (!slip.picks[index]) return slip
  const clamped = Math.max(0, Math.min(MAX_STAKE, Math.floor(stake)))
  return {
    ...slip,
    picks: slip.picks.map((p, i) => (i === index ? { ...p, stake: clamped } : p)),
    lastStake: remember && clamped >= 1 ? clamped : slip.lastStake,
  }
}

export function slipReducer(slip: Slip, action: SlipAction): Slip {
  switch (action.type) {
    case 'add': {
      const at = slip.picks.findIndex((p) => samePick(p, action.pick))
      if (at >= 0) return updateAt(slip, at, (slip.picks[at]?.stake ?? 0) + slip.lastStake, false)
      if (addBlockReason(slip, action.pick)) return slip
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
    case 'addMany': {
      if (newPickCount(slip, action.picks) > slipRoom(slip) || overGameRoom(slip, action.picks)) return slip
      let next = slip
      for (const pick of action.picks) {
        const at = next.picks.findIndex((p) => samePick(p, pick))
        next =
          at >= 0
            ? updateAt(next, at, (next.picks[at]?.stake ?? 0) + pick.stake, false)
            : { ...next, picks: [...next.picks, { ...pick, stake: Math.min(MAX_STAKE, pick.stake) }] }
      }
      return { ...next, lastStake: action.lastStake >= 1 ? action.lastStake : slip.lastStake }
    }
    case 'setAccount':
      return { ...slip, account: action.account }
    case 'clear':
      return { ...slip, picks: [] }
    case 'restore':
      return slip.picks.length > 0 ? slip : { ...slip, picks: action.picks }
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
  account: z
    .enum(['WALLET', 'POINTS'])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
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

/** The slip's account: the player's choice, else points when they have any, else the wallet. */
export function resolveAccount(chosen: BetAccount | null, b: Balances): BetAccount {
  return chosen ?? (b.points > 0 ? 'POINTS' : 'WALLET')
}

/** Why the chosen balance can't pay the slip, and the other account when it can; null when it can. */
export function slipShortfall(
  account: BetAccount,
  b: Balances,
  total: number,
): { message: string; switchTo: BetAccount | null } | null {
  const available = availableFor(account, b)
  if (total <= available) return null
  const other = otherAccount(account)
  return {
    message: notEnoughMessage(account, available),
    switchTo: total <= availableFor(other, b) ? other : null,
  }
}

/** A pick's est. return by account: a points stake comes back as points, the profit as wallet. */
export function returnSplit(account: BetAccount, stake: number, estimate: number): Funding {
  if (account === 'WALLET') return { wallet: estimate, points: 0 }
  const points = Math.min(stake, estimate)
  return { wallet: Math.max(0, estimate - stake), points }
}

/** bestCaseReturn, split by account: the best pick of each game. */
export function bestCaseSplit(picks: SlipPick[], returns: (number | null)[], account: BetAccount): Funding {
  const best = new Map<string, { stake: number; ret: number }>()
  picks.forEach((p, i) => {
    const r = returns[i]
    if (r == null) return
    const cur = best.get(p.gameId)
    if (!cur || r > cur.ret) best.set(p.gameId, { stake: p.stake, ret: r })
  })
  const sum: Funding = { wallet: 0, points: 0 }
  for (const { stake, ret } of best.values()) {
    const part = returnSplit(account, stake, ret)
    sum.wallet += part.wallet
    sum.points += part.points
  }
  return sum
}
