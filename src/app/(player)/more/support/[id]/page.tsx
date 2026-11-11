import { notFound } from 'next/navigation'

import { ActionForm } from '@/components/action-form'
import { ChatThread } from '@/components/support/chat-thread'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DomainError } from '@/lib/errors'
import { getInquiryThread } from '@/server/inquiries'
import { requireUser } from '@/server/session'

import { closeInquiryAction, replyInquiryAction } from '../../../actions'

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const thread = await getInquiryThread(user.id, id).catch((e: unknown) => {
    if (e instanceof DomainError) notFound()
    throw e
  })
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{thread.subject}</h1>
        <span className="bg-surface-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {thread.status}
        </span>
      </div>
      <ChatThread messages={thread.messages} viewer="PLAYER" />
      {/* Stay mounted (hidden, not removed) so the success toast is not lost when the revalidated
          ticket flips to CLOSED. */}
      <div
        className={
          thread.status === 'CLOSED' ? 'hidden' : 'bg-card border-border space-y-3 rounded-xl border p-4'
        }
      >
        <ActionForm action={replyInquiryAction.bind(null, id)} submitLabel="Reply" resetOnSuccess>
          <Label htmlFor="body">Reply</Label>
          <Textarea id="body" name="body" rows={4} maxLength={5000} required />
        </ActionForm>
        <ActionForm action={closeInquiryAction.bind(null, id)} submitLabel="Close ticket" />
      </div>
    </div>
  )
}
