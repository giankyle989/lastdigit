import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/format'
import { listInquiriesForUser } from '@/server/inquiries'
import { requireUser } from '@/server/session'

import { createInquiryAction } from '../../actions'

export default async function SupportPage() {
  const user = await requireUser()
  const tickets = await listInquiriesForUser(user.id)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Support</h1>
      <Card>
        <CardHeader>
          <CardTitle>My tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tickets yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/more/support/${t.id}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1 font-medium">{t.subject}</span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(t.updatedAt)}</span>
                    <span className="bg-surface-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      {t.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createInquiryAction} submitLabel="Send" className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" maxLength={120} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" name="body" rows={5} maxLength={5000} required />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  )
}
