/** Most picks a bet slip may hold (spec §4.3, §6.1; multi-select heatmap spec §3.2). */
export const MAX_SLIP_PICKS = 100
/** Most different endings one player may hold on one game, so nobody can cover them all. */
export const MAX_ENDINGS_PER_GAME = 20
/**
 * Largest single stake accepted. Point columns are 32-bit (max 2,147,483,647), so stakes, grants
 * and the per-player stake limit stay far below that to keep pools, balances and payouts in range.
 */
export const MAX_STAKE = 1_000_000
/** Largest single admin grant or deduction. */
export const MAX_GRANT = 10_000_000

export function endingLimitMessage(left: number): string {
  return `At most ${MAX_ENDINGS_PER_GAME} endings per game (${Math.max(0, left)} left)`
}
