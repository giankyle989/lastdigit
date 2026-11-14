/** Most picks a bet slip may hold (spec §4.3, §6.1; multi-select heatmap spec §3.2). */
export const MAX_SLIP_PICKS = 100
/**
 * Largest single stake accepted. Point columns are 32-bit (max 2,147,483,647), so stakes, grants
 * and the per-player stake limit stay far below that to keep pools, balances and payouts in range.
 */
export const MAX_STAKE = 1_000_000
/** Largest single admin grant or deduction. */
export const MAX_GRANT = 10_000_000
