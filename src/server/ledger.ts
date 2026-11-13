import type { TransactionType } from '@prisma/client'

import type { Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'

export type LedgerEntry = {
  userId: string
  type: TransactionType
  amount: number
  gameId?: string
  betId?: string
  adminId?: string
  note?: string
}

/**
 * The ONLY way to change User.balance. Must be called inside prisma.$transaction.
 * requireFunds: the update only applies if the resulting balance stays >= 0.
 */
export async function postEntry(tx: Tx, entry: LedgerEntry, opts: { requireFunds?: boolean } = {}) {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    throw new DomainError('VALIDATION', 'Amount must be a non-zero whole number')
  }

  let balanceAfter: number
  if (opts.requireFunds) {
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE "User" SET balance = balance + ${entry.amount}
      WHERE id = ${entry.userId} AND balance + ${entry.amount} >= 0
      RETURNING balance`
    const row = rows[0]
    if (!row) throw new DomainError('INSUFFICIENT_BALANCE', 'Insufficient balance')
    balanceAfter = row.balance
  } else {
    const updated = await tx.user.update({
      where: { id: entry.userId },
      data: { balance: { increment: entry.amount } },
      select: { balance: true },
    })
    balanceAfter = updated.balance
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
