import type { BetResult } from '@prisma/client'

export const BET_TABS = ['open', 'settled', 'refunded'] as const
export type BetTab = (typeof BET_TABS)[number]

export const BET_TAB_LABELS: Record<BetTab, string> = {
  open: 'Open',
  settled: 'Settled',
  refunded: 'Refunded',
}

export const BET_TAB_RESULTS: Record<BetTab, BetResult[]> = {
  open: ['PENDING'],
  settled: ['WON', 'LOST'],
  refunded: ['REFUNDED'],
}

export function parseBetTab(raw: unknown): BetTab {
  return BET_TABS.find((t) => t === raw) ?? 'open'
}
