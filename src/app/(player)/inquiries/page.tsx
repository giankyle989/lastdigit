import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { formatDateTime } from '@/lib/format'
import { listInquiriesForUser } from '@/server/inquiries'
import { requireUser } from '@/server/session'

import { createInquiryAction } from '../actions'

export default async function InquiriesPage() {
  const user = await requireUser()
  const inquiries = await listInquiriesForUser(user.id)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h1 className="mb-3 text-xl font-semibold">My inquiries</h1>
        <ul className="divide-y text-sm">
          {inquiries.map((i) => (
            <li key={i.id} className="py-2">
              <Link href={`/inquiries/${i.id}`} className="underline">
                {i.subject}
              </Link>
              <span className="ml-2 text-xs text-gray-500">
                {i.status} · {formatDateTime(i.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
        {inquiries.length === 0 && <p className="text-sm text-gray-500">No inquiries yet.</p>}
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">New inquiry</h2>
        <ActionForm action={createInquiryAction} submitLabel="Send">
          <div>
            <label htmlFor="subject" className="label">
              Subject
            </label>
            <input id="subject" name="subject" className="input" maxLength={120} required />
          </div>
          <div>
            <label htmlFor="body" className="label">
              Message
            </label>
            <textarea id="body" name="body" className="input" rows={5} maxLength={5000} required />
          </div>
        </ActionForm>
      </div>
    </div>
  )
}
