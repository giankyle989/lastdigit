import { formatPhPhone } from './phone'

/** What a new support ticket is about. Cash in and Cash out come with a prefilled message. */
export const SUPPORT_TOPICS = ['CASH_IN', 'CASH_OUT', 'OTHER'] as const
export type SupportTopic = (typeof SUPPORT_TOPICS)[number]

export const TOPIC_LABELS: Record<SupportTopic, string> = {
  CASH_IN: 'Cash in',
  CASH_OUT: 'Cash out',
  OTHER: 'Other',
}

/** The ticket subject a topic saves, or null when the player types their own. */
export function topicSubject(topic: SupportTopic): string | null {
  return topic === 'OTHER' ? null : TOPIC_LABELS[topic]
}

/** The editable message a topic starts with; `phone` is E.164 or null. */
export function topicTemplate(topic: SupportTopic, phone: string | null): string {
  const number = phone ? formatPhPhone(phone) : ''
  switch (topic) {
    case 'CASH_IN':
      return `I'd like to cash in.\nAmount: \nPaid from: ${number}\nReference no.: `
    case 'CASH_OUT':
      return `I'd like to cash out from my wallet.\nAmount: \nSend to: ${number}`
    case 'OTHER':
      return ''
  }
}

/** The message after switching topic: the new template, unless the player already typed something. */
export function nextMessage(
  current: string,
  from: SupportTopic,
  to: SupportTopic,
  phone: string | null,
): string {
  const untouched = current.trim() === '' || current === topicTemplate(from, phone)
  return untouched ? topicTemplate(to, phone) : current
}

/** The topic a saved subject belongs to (exact match, as the form saves it). */
export function subjectTopic(subject: string): SupportTopic {
  if (subject === TOPIC_LABELS.CASH_IN) return 'CASH_IN'
  if (subject === TOPIC_LABELS.CASH_OUT) return 'CASH_OUT'
  return 'OTHER'
}

/** The amount from a cash message's "Amount:" line, or null when it is missing or unclear. */
export function parseTicketAmount(body: string): number | null {
  const m = /^\s*amount:[ \t]*([\d,]+)/im.exec(body)
  if (!m?.[1]) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** The reply staff post on a cash ticket once it is recorded. */
export function cashReply(kind: 'CASH_IN' | 'CASH_OUT', amount: number): string {
  return `${TOPIC_LABELS[kind]} of ${amount.toLocaleString('en-US')} recorded.`
}
