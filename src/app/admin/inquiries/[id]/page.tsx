import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { InquiryThread } from '@/components/inquiry-thread'
import { DomainError } from '@/lib/errors'
import { getInquiryThread } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { adminCloseAction, adminReplyAction } from '../../actions'

export default async function AdminInquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await params
  const thread = await getInquiryThread(admin.id, id).catch((e) => {
    if (e instanceof DomainError) notFound()
    throw e
  })
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">From {thread.user.username}</p>
      <InquiryThread thread={thread} />
      {thread.status !== 'CLOSED' && (
        <div className="card space-y-4">
          <ActionForm action={adminReplyAction.bind(null, id)} submitLabel="Send reply" resetOnSuccess>
            <label htmlFor="body" className="label">
              Reply
            </label>
            <textarea id="body" name="body" className="input" rows={4} maxLength={5000} required />
          </ActionForm>
          <ActionForm action={adminCloseAction.bind(null, id)} submitLabel="Close inquiry" />
        </div>
      )}
    </div>
  )
}
