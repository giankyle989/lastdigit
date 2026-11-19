import { type Account, Prisma, type TransactionType } from '@prisma/client'

import type { Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'

export type LedgerEntry = {
  userId: string
  /** Which balance the entry changes. */
  account: Account
  type: TransactionType
  amount: number
  gameId?: string
  betId?: string
  adminId?: string
  note?: string
}

const COLUMN = { WALLET: 'walletBalance', POINTS: 'pointsBalance' } as const satisfies Record<Account, string>

const NOT_ENOUGH: Record<Account, string> = {
  WALLET: 'Not enough in the wallet',
  POINTS: 'Not enough points',
}

/**
 * The ONLY way to change User.walletBalance or User.pointsBalance. Must be called inside
 * prisma.$transaction. requireFunds: the update only applies if that balance stays >= 0.
 */
export async function postEntry(tx: Tx, entry: LedgerEntry, opts: { requireFunds?: boolean } = {}) {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    throw new DomainError('VALIDATION', 'Amount must be a non-zero whole number')
  }
  const column = COLUMN[entry.account]

  let balanceAfter: number
  if (opts.requireFunds) {
    // The column name comes from the fixed map above, never from input.
    const col = Prisma.raw(`"${column}"`)
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE "User" SET ${col} = ${col} + ${entry.amount}
      WHERE id = ${entry.userId} AND ${col} + ${entry.amount} >= 0
      RETURNING ${col} AS balance`
    const row = rows[0]
    if (!row) throw new DomainError('INSUFFICIENT_BALANCE', NOT_ENOUGH[entry.account])
    balanceAfter = row.balance
  } else {
    const updated = await tx.user.update({
      where: { id: entry.userId },
      data: { [column]: { increment: entry.amount } },
      select: { walletBalance: true, pointsBalance: true },
    })
    balanceAfter = updated[column]
  }

  return tx.transaction.create({ data: { ...entry, balanceAfter } })
}

/**
 * Locks the given users FOR UPDATE in ascending id order (the same order settlement and void post
 * entries in), so a transaction that credits several users can't deadlock with another.
 */
export async function lockUsers(tx: Tx, userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`
}
