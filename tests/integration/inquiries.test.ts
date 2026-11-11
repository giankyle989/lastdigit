import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import {
  closeInquiry,
  createInquiry,
  getInquiryThread,
  listInquiriesAdmin,
  replyToInquiry,
} from '@/server/inquiries'
import { makeUser, resetDb } from '../helpers/db'

describe('inquiries', () => {
  beforeEach(resetDb)

  it('runs the OPEN → ANSWERED → OPEN → CLOSED flow', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    const inq = await createInquiry(p.id, { subject: 'Missing points', body: 'Where are my points?' })
    expect(inq.status).toBe('OPEN')

    await replyToInquiry(admin.id, inq.id, { body: 'Checking.' })
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inq.id } })).status).toBe('ANSWERED')

    await replyToInquiry(p.id, inq.id, { body: 'Thanks' })
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inq.id } })).status).toBe('OPEN')

    await closeInquiry(p.id, inq.id)
    const thread = await getInquiryThread(p.id, inq.id)
    expect(thread.status).toBe('CLOSED')
    expect(thread.messages.map((m) => m.body)).toEqual(['Where are my points?', 'Checking.', 'Thanks'])
    expect(thread.messages[1].author.role).toBe('ADMIN')
  })

  it('rejects replies to closed inquiries', async () => {
    const p = await makeUser()
    const inq = await createInquiry(p.id, { subject: 's', body: 'b' })
    await closeInquiry(p.id, inq.id)
    await expect(replyToInquiry(p.id, inq.id, { body: 'hello?' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('validates subject and body', async () => {
    const p = await makeUser()
    await expect(createInquiry(p.id, { subject: ' ', body: 'b' })).rejects.toBeInstanceOf(ZodError)
    await expect(createInquiry(p.id, { subject: 's', body: '' })).rejects.toBeInstanceOf(ZodError)
  })

  // Review Focus #5
  it('hides other players inquiries', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const inq = await createInquiry(owner.id, { subject: 's', body: 'b' })
    await expect(getInquiryThread(other.id, inq.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(replyToInquiry(other.id, inq.id, { body: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(closeInquiry(other.id, inq.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lists inquiries for admins by status', async () => {
    const p = await makeUser({ username: 'kyle' })
    await createInquiry(p.id, { subject: 'a', body: 'b' })
    const closed = await createInquiry(p.id, { subject: 'c', body: 'd' })
    await closeInquiry(p.id, closed.id)
    const open = await listInquiriesAdmin('OPEN')
    expect(open.map((i) => i.subject)).toEqual(['a'])
    expect(open[0].user.username).toBe('kyle')
  })
})
