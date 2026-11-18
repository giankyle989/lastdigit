import type { TransactionType } from '@prisma/client'

export const WALLET_FILTERS = ['all', 'bets', 'payouts', 'bonuses', 'admin', 'refunds'] as const
export type WalletFilter = (typeof WALLET_FILTERS)[number]

export const WALLET_FILTER_LABELS: Record<WalletFilter, string> = {
  all: 'All',
  bets: 'Bets',
  payouts: 'Payouts',
  bonuses: 'Bonuses',
  admin: 'Admin',
  refunds: 'Refunds',
}

/** Transaction types per filter chip; `null` = no type filter (spec §4.5). */
export const WALLET_FILTER_TYPES: Record<WalletFilter, TransactionType[] | null> = {
  all: null,
  bets: ['BET'],
  payouts: ['PAYOUT'],
  bonuses: ['SIGNUP_BONUS', 'DAILY_BONUS', 'REFERRAL_BONUS'],
  admin: ['ADMIN_GRANT', 'ADMIN_DEDUCT'],
  refunds: ['REFUND'],
}

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  BET: 'Bet',
  PAYOUT: 'Payout',
  REFERRAL_BONUS: 'Referral bonus',
  SIGNUP_BONUS: 'Welcome bonus',
  DAILY_BONUS: 'Daily bonus',
  ADMIN_GRANT: 'Admin grant',
  ADMIN_DEDUCT: 'Admin deduction',
  REFUND: 'Refund',
}

export function parseWalletFilter(raw: unknown): WalletFilter {
  return WALLET_FILTERS.find((f) => f === raw) ?? 'all'
}

export const ADJUST_KINDS = ['CASH_IN', 'CASH_OUT', 'GIVE_POINTS', 'TAKE_POINTS'] as const
export type AdjustKind = (typeof ADJUST_KINDS)[number]

export type AdjustResult = { kind: AdjustKind; welcomeBonus: number; referralBonus: number }

const ADJUST_DONE: Record<AdjustKind, string> = {
  CASH_IN: 'Cash in recorded',
  CASH_OUT: 'Cash out recorded',
  GIVE_POINTS: 'Points given',
  TAKE_POINTS: 'Points taken',
}

/** Success toast for a staff balance change, listing any bonuses a first cash in paid. */
export function adjustToast({ kind, welcomeBonus, referralBonus }: AdjustResult): string {
  const extras = [
    welcomeBonus > 0 && `+${welcomeBonus.toLocaleString('en-US')} welcome bonus points`,
    referralBonus > 0 && `+${referralBonus.toLocaleString('en-US')} points to their referrer`,
  ].filter(Boolean)
  return extras.length ? `${ADJUST_DONE[kind]} (${extras.join(', ')})` : ADJUST_DONE[kind]
}
