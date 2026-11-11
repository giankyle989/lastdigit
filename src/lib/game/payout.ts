export const PAYOUT_PERCENT = 90

export type StakeEntry = { id: string; stake: number; isWinner: boolean }
export type Split = { pool: number; houseTake: number; payouts: Map<string, number> }

export function computeSplit(bets: StakeEntry[]): Split {
  const pool = bets.reduce((sum, b) => sum + b.stake, 0)
  const winners = bets.filter((b) => b.isWinner)
  const totalWinning = winners.reduce((sum, b) => sum + b.stake, 0)
  const payouts = new Map<string, number>()
  if (totalWinning === 0) return { pool, houseTake: pool, payouts }

  // BigInt arithmetic keeps the floored 90% share exact for large pools.
  const payoutPool = (BigInt(pool) * BigInt(PAYOUT_PERCENT)) / BigInt(100)
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
 * `pool`, assuming no further bets. Equals computeSplit's payout for that bet (spec §6.3).
 */
export function estimatePayout(pool: number, endingStake: number, stake: number): number {
  if (!Number.isInteger(stake) || stake <= 0) return 0
  const payoutPool = (BigInt(pool + stake) * BigInt(PAYOUT_PERCENT)) / BigInt(100)
  return Number((payoutPool * BigInt(stake)) / BigInt(endingStake + stake))
}
