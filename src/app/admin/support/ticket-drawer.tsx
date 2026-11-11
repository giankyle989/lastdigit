import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { ChatThread } from '@/components/support/chat-thread'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { getInquiryThread } from '@/server/inquiries'

import { adminCloseAction, adminReplyAction } from '../actions'

type Thread = Awaited<ReturnType<typeof getInquiryThread>>

export function TicketDrawer({ thread }: { thread: Thread }) {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        From{' '}
        <Link href={`/admin/players?player=${thread.userId}`} className="text-primary hover:underline">
          {thread.user.username}
        </Link>{' '}
        · <span className="font-semibold">{thread.status}</span>
      </p>
      <ChatThread messages={thread.messages} viewer="ADMIN" />
      {/* Stay mounted (hidden, not removed) so the success toast is not lost when the revalidated
          ticket flips to CLOSED. */}
      <div className={thread.status === 'CLOSED' ? 'hidden' : 'space-y-3'}>
        <ActionForm action={adminReplyAction.bind(null, thread.id)} submitLabel="Send reply" resetOnSuccess>
          <Label htmlFor="body">Reply</Label>
          <Textarea id="body" name="body" rows={4} maxLength={5000} required />
        </ActionForm>
        <ActionForm action={adminCloseAction.bind(null, thread.id)} submitLabel="Close ticket" />
      </div>
    </>
  )
}
