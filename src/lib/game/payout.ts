export const PAYOUT_PERCENT = 90

export type StakeEntry = { id: string; stake: number; isWinner: boolean }
export type Split = { pool: number; houseTake: number; payouts: Map<string, number> }

/**
 * Why a settled pool is refunded instead of paid out, or null to settle normally:
 * - SOLO: only one player bet, so there is nobody to play against;
 * - NO_LOSERS: every bet is on the winning ending, so there is no losing stake to win.
 */
export type RefundReason = 'SOLO' | 'NO_LOSERS'

export const REFUND_NOTES: Record<RefundReason, string> = {
  SOLO: 'Refunded: only one player in this pool',
  NO_LOSERS: 'Refunded: every bet was on the winning ending',
}

export function refundReason(bets: { userId: string; isWinner: boolean }[]): RefundReason | null {
  if (bets.length === 0) return null
  if (new Set(bets.map((b) => b.userId)).size < 2) return 'SOLO'
  if (bets.every((b) => b.isWinner)) return 'NO_LOSERS'
  return null
}

/**
 * Winners split 90% of the pool by stake, but never get back less than they staked: when 90% of
 * the pool is smaller than the winning stake, the house take shrinks to cover it.
 */
function payoutPoolOf(pool: number, winningStake: number): bigint {
  const ninety = (BigInt(pool) * BigInt(PAYOUT_PERCENT)) / BigInt(100)
  const winning = BigInt(winningStake)
  return ninety > winning ? ninety : winning
}

export function computeSplit(bets: StakeEntry[]): Split {
  const pool = bets.reduce((sum, b) => sum + b.stake, 0)
  const winners = bets.filter((b) => b.isWinner)
  const totalWinning = winners.reduce((sum, b) => sum + b.stake, 0)
  const payouts = new Map<string, number>()
  if (totalWinning === 0) return { pool, houseTake: pool, payouts }

  // BigInt arithmetic keeps the floored share exact for large pools.
  const payoutPool = payoutPoolOf(pool, totalWinning)
  const total = BigInt(totalWinning)
  let paid = BigInt(0)
  for (const w of winners) {
    const amount = (payoutPool * BigInt(w.stake)) / total
    payouts.set(w.id, Number(amount))
    paid += amount
  }
  return { pool, houseTake: pool - Number(paid), payouts }
}

/**
 * Payout for a new bet of `stake` on an ending that already has `endingStake`, in a pool of
 * `pool`, assuming no further bets. Equals computeSplit's payout for that bet (spec §6.3); when
 * the pool would be refunded instead, that is the stake, which this also returns.
 */
export function estimatePayout(pool: number, endingStake: number, stake: number): number {
  if (!Number.isInteger(stake) || stake <= 0) return 0
  const payoutPool = payoutPoolOf(pool + stake, endingStake + stake)
  return Number((payoutPool * BigInt(stake)) / BigInt(endingStake + stake))
}
