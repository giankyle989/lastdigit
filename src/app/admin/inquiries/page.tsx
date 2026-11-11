import { InquiryStatus } from '@prisma/client'
import Link from 'next/link'
import { formatDateTime } from '@/lib/format'
import { listInquiriesAdmin } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'

const STATUSES = Object.values(InquiryStatus)

export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin()
  const { status } = await searchParams
  const filter = STATUSES.includes(status as InquiryStatus) ? (status as InquiryStatus) : 'OPEN'
  const inquiries = await listInquiriesAdmin(filter)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inquiries</h1>
      <div className="flex gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/inquiries?status=${s}`} className={filter === s ? 'btn' : 'btn-secondary'}>{s}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Subject</th><th>Player</th><th>Messages</th><th>Updated</th></tr></thead>
          <tbody>
            {inquiries.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/admin/inquiries/${i.id}`} className="underline">{i.subject}</Link></td>
                <td>{i.user.username}</td>
                <td>{i._count.messages}</td>
                <td>{formatDateTime(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {inquiries.length === 0 && <p className="p-2 text-sm text-gray-500">Nothing here.</p>}
      </div>
    </div>
  )
}
