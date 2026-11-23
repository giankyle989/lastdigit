import { formatAmount } from './format'

/** How an amount is split between the two balances. */
export type Funding = { points: number; wallet: number }

/**
 * A payout or refund for a bet: the part of the stake points paid goes back to points, the rest
 * (the wallet stake plus any profit) to the wallet.
 */
export function splitReturn(amount: number, pointsStake: number): Funding {
  const points = Math.min(amount, Math.max(0, pointsStake))
  return { points, wallet: amount - points }
}

export type BetAccount = 'WALLET' | 'POINTS'
export type Balances = { wallet: number; points: number }

/** The chosen balance; a negative balance counts as 0. A slip is paid from one account only. */
export function availableFor(account: BetAccount, b: Balances): number {
  return Math.max(0, account === 'POINTS' ? b.points : b.wallet)
}

export function notEnoughMessage(account: BetAccount, available: number): string {
  return account === 'POINTS'
    ? `Not enough points (${formatAmount('points', available)}).`
    : `Not enough in the wallet (${formatAmount('wallet', available)}).`
}

export function otherAccount(account: BetAccount): BetAccount {
  return account === 'POINTS' ? 'WALLET' : 'POINTS'
}
