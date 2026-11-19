/** How an amount is split between the two balances. */
export type Funding = { points: number; wallet: number }

/** A stake is paid from points first, then the wallet; a negative balance counts as 0. */
export function splitStake(stake: number, pointsAvailable: number): Funding {
  const points = Math.min(stake, Math.max(0, pointsAvailable))
  return { points, wallet: stake - points }
}

/**
 * A payout or refund for a bet: the part of the stake points paid goes back to points, the rest
 * (the wallet stake plus any profit) to the wallet.
 */
export function splitReturn(amount: number, pointsStake: number): Funding {
  const points = Math.min(amount, Math.max(0, pointsStake))
  return { points, wallet: amount - points }
}
