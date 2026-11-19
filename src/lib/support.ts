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
