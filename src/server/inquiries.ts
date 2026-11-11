import type { InquiryStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'

const subjectSchema = z.string({ required_error: 'Subject is required' }).trim().min(1, 'Subject is required').max(120)
const bodySchema = z.string({ required_error: 'Message is required' }).trim().min(1, 'Message is required').max(5000)

async function loadForActor(db: Tx, actorId: string, inquiryId: string) {
  const [actor, inquiry] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actorId } }),
    db.inquiry.findUnique({ where: { id: inquiryId } }),
  ])
  if (!inquiry || (actor.role !== 'ADMIN' && inquiry.userId !== actorId)) {
    throw new DomainError('NOT_FOUND', 'Inquiry not found')
  }
  return { actor, inquiry }
}

export async function createInquiry(userId: string, input: unknown) {
  const { subject, body } = z.object({ subject: subjectSchema, body: bodySchema }).parse(input)
  return prisma.inquiry.create({
    data: { userId, subject, messages: { create: { authorId: userId, body } } },
  })
}

export async function replyToInquiry(actorId: string, inquiryId: string, input: unknown): Promise<void> {
  const { body } = z.object({ body: bodySchema }).parse(input)
  await prisma.$transaction(async (tx) => {
    const { actor } = await loadForActor(tx, actorId, inquiryId)
    // Conditional write first: takes the row lock, so a concurrent close either
    // commits before (count 0 here) or waits and then sets CLOSED last.
    const res = await tx.inquiry.updateMany({
      where: { id: inquiryId, status: { not: 'CLOSED' } },
      data: { status: actor.role === 'ADMIN' ? 'ANSWERED' : 'OPEN' },
    })
    if (res.count === 0) throw new DomainError('CONFLICT', 'This inquiry is closed')
    await tx.inquiryMessage.create({ data: { inquiryId, authorId: actorId, body } })
  })
}

export async function closeInquiry(actorId: string, inquiryId: string): Promise<void> {
  const { inquiry } = await loadForActor(prisma, actorId, inquiryId)
  if (inquiry.status === 'CLOSED') return
  await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: 'CLOSED' } })
}

export async function getInquiryThread(viewerId: string, inquiryId: string) {
  await loadForActor(prisma, viewerId, inquiryId)
  return prisma.inquiry.findUniqueOrThrow({
    where: { id: inquiryId },
    include: {
      user: { select: { username: true } },
      messages: {
        include: { author: { select: { username: true, role: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  })
}

export function listInquiriesForUser(userId: string) {
  return prisma.inquiry.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
}

export function listInquiriesAdmin(status?: InquiryStatus) {
  return prisma.inquiry.findMany({
    where: status ? { status } : {},
    include: { user: { select: { username: true } }, _count: { select: { messages: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
}
