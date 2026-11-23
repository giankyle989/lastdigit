import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { recordTicketCash } from '@/server/admin/ticket-cash'
import { createInquiry } from '@/server/inquiries'

import { expectLedgerConsistent, fundUser, makeUser, resetDb } from '../helpers/db'

async function walletOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalance
}

describe('recordTicketCash', () => {
  beforeEach(resetDb)

  it('records a cash in from a Cash in ticket, replies and closes it', async () => {
    const staff = await makeUser({ role: 'MANAGER' })
    const p = await makeUser()
    const t = await createInquiry(p.id, { subject: 'Cash in', body: 'Amount: 300' })
    const r = await recordTicketCash(staff.id, t.id, { kind: 'CASH_IN', amount: '300', note: 'GCash ref 1' })
    expect(r.kind).toBe('CASH_IN')
    expect(await walletOf(p.id)).toBe(300)
    const thread = await prisma.inquiry.findUniqueOrThrow({
      where: { id: t.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    expect(thread.status).toBe('CLOSED')
    expect(thread.messages.at(-1)).toMatchObject({ authorId: staff.id, body: 'Cash in of ₱300 recorded.' })
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId: p.id, type: 'ADMIN_GRANT' } })
    expect(tx.note).toBe(`Ticket ${t.id}: GCash ref 1`)
    await expectLedgerConsistent()
  })

  it('records a cash out from a Cash out ticket', async () => {
    const staff = await makeUser({ role: 'MANAGER' })
    const p = await makeUser()
    await fundUser(p.id, 500)
    const t = await createInquiry(p.id, { subject: 'Cash out', body: 'Amount: 200' })
    await recordTicketCash(staff.id, t.id, { kind: 'CASH_OUT', amount: 200, note: 'sent' })
    expect(await walletOf(p.id)).toBe(300)
  })

  it('refuses a kind that does not match the ticket subject, and other tickets', async () => {
    const staff = await makeUser({ role: 'MANAGER' })
    const p = await makeUser()
    const cashIn = await createInquiry(p.id, { subject: 'Cash in', body: 'x' })
    const other = await createInquiry(p.id, { subject: 'Missing points', body: 'x' })
    await expect(
      recordTicketCash(staff.id, cashIn.id, { kind: 'CASH_OUT', amount: 10, note: 'x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      recordTicketCash(staff.id, other.id, { kind: 'CASH_IN', amount: 10, note: 'x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      recordTicketCash(staff.id, cashIn.id, { kind: 'GIVE_POINTS', amount: 10, note: 'x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(await walletOf(p.id)).toBe(0)
  })

  it('records only once: a closed ticket is refused and the balance is unchanged', async () => {
    const staff = await makeUser({ role: 'MANAGER' })
    const p = await makeUser()
    const t = await createInquiry(p.id, { subject: 'Cash in', body: 'Amount: 100' })
    const input = { kind: 'CASH_IN', amount: 100, note: 'x' }
    const results = await Promise.allSettled([
      recordTicketCash(staff.id, t.id, input),
      recordTicketCash(staff.id, t.id, input),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((r) => r.status === 'rejected')
    expect(failed?.status === 'rejected' && failed.reason).toMatchObject({ code: 'CONFLICT' })
    expect(await prisma.transaction.count({ where: { userId: p.id, type: 'ADMIN_GRANT' } })).toBe(1)
    await expectLedgerConsistent()
  })

  it('leaves the ticket open when the balance change fails', async () => {
    const staff = await makeUser({ role: 'MANAGER' })
    const p = await makeUser()
    const t = await createInquiry(p.id, { subject: 'Cash out', body: 'Amount: 100' })
    await expect(
      recordTicketCash(staff.id, t.id, { kind: 'CASH_OUT', amount: 100, note: 'x' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
    const thread = await prisma.inquiry.findUniqueOrThrow({
      where: { id: t.id },
      include: { messages: true },
    })
    expect(thread.status).toBe('OPEN')
    expect(thread.messages).toHaveLength(1)
  })

  it('needs permission to adjust balances', async () => {
    const p = await makeUser()
    const t = await createInquiry(p.id, { subject: 'Cash in', body: 'x' })
    await expect(
      recordTicketCash(p.id, t.id, { kind: 'CASH_IN', amount: 10, note: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
