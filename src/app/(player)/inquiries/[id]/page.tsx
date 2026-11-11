import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { InquiryThread } from '@/components/inquiry-thread'
import { DomainError } from '@/lib/errors'
import { getInquiryThread } from '@/server/inquiries'
import { requireUser } from '@/server/session'
import { closeInquiryAction, replyInquiryAction } from '../../actions'

export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const thread = await getInquiryThread(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound()
    throw e
  })
  return (
    <div className="space-y-4">
      <InquiryThread thread={thread} />
      {thread.status !== 'CLOSED' && (
        <div className="card space-y-4">
          <ActionForm action={replyInquiryAction.bind(null, id)} submitLabel="Reply" resetOnSuccess>
            <label htmlFor="body" className="label">
              Reply
            </label>
            <textarea id="body" name="body" className="input" rows={4} maxLength={5000} required />
          </ActionForm>
          <ActionForm action={closeInquiryAction.bind(null, id)} submitLabel="Close inquiry" />
        </div>
      )}
    </div>
  )
}
