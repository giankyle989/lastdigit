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
  bonuses: ['REFERRAL_BONUS'],
  admin: ['ADMIN_GRANT', 'ADMIN_DEDUCT'],
  refunds: ['REFUND'],
}

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  BET: 'Bet',
  PAYOUT: 'Payout',
  REFERRAL_BONUS: 'Referral bonus',
  ADMIN_GRANT: 'Admin grant',
  ADMIN_DEDUCT: 'Admin deduction',
  REFUND: 'Refund',
}

export function parseWalletFilter(raw: unknown): WalletFilter {
  return WALLET_FILTERS.find((f) => f === raw) ?? 'all'
}
