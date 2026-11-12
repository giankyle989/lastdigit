import { prisma } from '@/lib/db'

export type EndingStakes = {
  /** Sum of all non-refunded stakes. */
  pool: number
  /** cells[awayDigit][homeDigit] = total stake on that ending. Totals only, never usernames. */
  cells: number[][]
}

function emptyCells(): number[][] {
  return Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0))
}

export async function getEndingStakes(gameId: string): Promise<EndingStakes> {
  const groups = await prisma.bet.groupBy({
    by: ['awayDigit', 'homeDigit'],
    where: { gameId, result: { not: 'REFUNDED' } },
    _sum: { stake: true },
  })
  const cells = emptyCells()
  let pool = 0
  for (const g of groups) {
    const row = cells[g.awayDigit]
    const stake = g._sum.stake ?? 0
    if (!row || g.homeDigit < 0 || g.homeDigit > 9) continue
    row[g.homeDigit] = stake
    pool += stake
  }
  return { pool, cells }
}
