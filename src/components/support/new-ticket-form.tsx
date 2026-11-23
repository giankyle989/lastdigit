'use client'

import { useState } from 'react'

import { ActionForm } from '@/components/action-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ActionState } from '@/lib/action-state'
import { formatAmount } from '@/lib/format'
import { nextMessage, SUPPORT_TOPICS, type SupportTopic, TOPIC_LABELS, topicSubject } from '@/lib/support'

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  /** The player's number in E.164, used to prefill the cash in / cash out message. */
  phone: string | null
  wallet: number
}

/** New ticket: Cash in and Cash out set the subject and start an editable message. */
export function NewTicketForm({ action, phone, wallet }: Props) {
  const [topic, setTopic] = useState<SupportTopic>('OTHER')
  const [body, setBody] = useState('')
  const subject = topicSubject(topic)

  return (
    <ActionForm action={action} submitLabel="Send" className="grid gap-3">
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Subject</legend>
        <div className="flex flex-wrap gap-x-4 text-sm">
          {SUPPORT_TOPICS.map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="topic"
                value={value}
                checked={topic === value}
                onChange={() => {
                  setBody((current) => nextMessage(current, topic, value, phone))
                  setTopic(value)
                }}
                className="accent-primary size-4"
              />
              {TOPIC_LABELS[value]}
            </label>
          ))}
        </div>
        {subject === null ? (
          <Input id="subject" name="subject" aria-label="Subject" maxLength={120} required />
        ) : (
          <input type="hidden" name="subject" value={subject} />
        )}
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="body">Message</Label>
        <Textarea
          id="body"
          name="body"
          rows={5}
          maxLength={5000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={topic === 'CASH_OUT' ? 'cash-out-hint' : undefined}
        />
        {topic === 'CASH_OUT' && (
          <p id="cash-out-hint" className="text-muted-foreground text-xs">
            Wallet: {formatAmount('wallet', wallet)} available. Points can&apos;t be cashed out.
          </p>
        )}
      </div>
    </ActionForm>
  )
}
