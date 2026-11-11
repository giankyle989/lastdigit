/** Heatmap shade 0–4 for a cell: 0 = nothing staked, 4 = the most-staked ending (spec §4.2: 5 steps). */
export function heatLevel(stake: number, maxStake: number): 0 | 1 | 2 | 3 | 4 {
  if (stake <= 0 || maxStake <= 0) return 0
  const level = Math.ceil((Math.min(stake, maxStake) / maxStake) * 4)
  return level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4
}

export function maxCell(cells: number[][]): number {
  return cells.reduce((max, row) => row.reduce((m, v) => Math.max(m, v), max), 0)
}
