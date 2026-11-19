import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { cashReply, subjectTopic } from '@/lib/support'
import type { AdjustResult } from '@/lib/wallet'

import { assertCan } from '../authz'
import { applyAdjustment, parseAdjustment } from './players'

/**
 * Records the cash in or cash out a support ticket asks for, then replies on it and closes it.
 * One transaction: closing the ticket is the conditional write, so it can be recorded only once,
 * and a failed balance change leaves the ticket open.
 */
export async function recordTicketCash(
  adminId: string,
  inquiryId: string,
  input: unknown,
): Promise<AdjustResult> {
  await assertCan(prisma, adminId, 'points.adjust')
  await assertCan(prisma, adminId, 'support.answer')
  const adjustment = parseAdjustment(input)
  const { kind } = adjustment
  if (kind !== 'CASH_IN' && kind !== 'CASH_OUT') {
    throw new DomainError('VALIDATION', 'Only cash in or cash out can be recorded from a ticket')
  }

  return prisma.$transaction(async (tx) => {
    const inquiry = await tx.inquiry.findUnique({ where: { id: inquiryId } })
    if (!inquiry) throw new DomainError('NOT_FOUND', 'Inquiry not found')
    if (subjectTopic(inquiry.subject) !== kind) {
      throw new DomainError(
        'VALIDATION',
        `This ticket is not a ${kind === 'CASH_IN' ? 'cash in' : 'cash out'} request`,
      )
    }
    const closed = await tx.inquiry.updateMany({
      where: { id: inquiryId, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED' },
    })
    if (closed.count === 0) throw new DomainError('CONFLICT', 'This ticket is closed')

    const result = await applyAdjustment(tx, adminId, inquiry.userId, {
      ...adjustment,
      note: `Ticket ${inquiryId}: ${adjustment.note}`,
    })
    await tx.inquiryMessage.create({
      data: { inquiryId, authorId: adminId, body: cashReply(kind, adjustment.amount) },
    })
    return result
  })
}
