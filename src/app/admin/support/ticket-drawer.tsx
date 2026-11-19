import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { ActionDialog } from '@/components/admin/action-dialog'
import { Field } from '@/components/admin/field'
import { PointsAmount } from '@/components/points-amount'
import { ChatThread } from '@/components/support/chat-thread'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseTicketAmount, subjectTopic } from '@/lib/support'
import type { getInquiryThread } from '@/server/inquiries'

import { adminCloseAction, adminReplyAction, ticketCashAction } from '../actions'

type Thread = Awaited<ReturnType<typeof getInquiryThread>>

export function TicketDrawer({ thread, canAdjust }: { thread: Thread; canAdjust: boolean }) {
  const topic = subjectTopic(thread.subject)
  // The amount the player wrote in their opening message, when it is clear.
  const asked = parseTicketAmount(thread.messages.find((m) => m.authorId === thread.userId)?.body ?? '')
  const cash =
    canAdjust && topic !== 'OTHER'
      ? topic === 'CASH_IN'
        ? { kind: 'CASH_IN', label: 'Record cash in', title: `Cash in for ${thread.user.username}` }
        : { kind: 'CASH_OUT', label: 'Record cash out', title: `Cash out for ${thread.user.username}` }
      : null
  const needsPhone = cash?.kind === 'CASH_IN' && !thread.user.phoneConfirmedAt
  const playerHref = `/admin/players?player=${thread.userId}`
  return (
    <>
      <p className="text-muted-foreground text-sm">
        From{' '}
        <Link href={playerHref} className="text-primary hover:underline">
          {thread.user.username}
        </Link>{' '}
        · <span className="font-semibold">{thread.status}</span>
      </p>
      <ChatThread messages={thread.messages} viewer="staff" />
      {/* Stay mounted (hidden, not removed) so the success toast is not lost when the revalidated
          ticket flips to CLOSED. */}
      <div className={thread.status === 'CLOSED' ? 'hidden' : 'space-y-3'}>
        {cash && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground text-sm" data-testid="ticket-cash-hint">
              {needsPhone ? (
                <>
                  Confirm the player&apos;s number in the{' '}
                  <Link href={playerHref} className="text-primary hover:underline">
                    player drawer
                  </Link>{' '}
                  before recording a cash in.
                </>
              ) : (
                <>
                  Wallet: <PointsAmount value={thread.user.walletBalance} unit />
                  {cash.kind === 'CASH_OUT' && ' available to cash out'}
                </>
              )}
            </p>
            <ActionDialog
              disabled={needsPhone}
              triggerLabel={cash.label}
              title={cash.title}
              description="Records it on the player, replies on this ticket and closes it."
              submitLabel={cash.label}
              action={ticketCashAction.bind(null, thread.id)}
            >
              <input type="hidden" name="kind" value={cash.kind} />
              <Field id="ticket-amount" label="Amount">
                <Input
                  id="ticket-amount"
                  name="amount"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={asked ?? undefined}
                  required
                />
              </Field>
              <Field id="ticket-note" label="Note">
                <Input id="ticket-note" name="note" maxLength={500} required />
              </Field>
            </ActionDialog>
          </div>
        )}
        <ActionForm action={adminReplyAction.bind(null, thread.id)} submitLabel="Send reply" resetOnSuccess>
          <Label htmlFor="body">Reply</Label>
          <Textarea id="body" name="body" rows={4} maxLength={5000} required />
        </ActionForm>
        <ActionForm action={adminCloseAction.bind(null, thread.id)} submitLabel="Close ticket" />
      </div>
    </>
  )
}
