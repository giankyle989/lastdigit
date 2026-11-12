import { TIME_ZONE, TIME_ZONE_LABEL } from './dates'

export function formatTipoff(d: Date): string {
  return (
    d.toLocaleString('en-US', {
      timeZone: TIME_ZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ` ${TIME_ZONE_LABEL}`
  )
}

export function formatDateTime(d: Date): string {
  return (
    d.toLocaleString('en-US', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }) +
    ` ${TIME_ZONE_LABEL}`
  )
}

/** "Nov 12, 2026" — the calendar date in TIME_ZONE. */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: TIME_ZONE, dateStyle: 'medium' })
}

export function formatPoints(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatSignedPoints(n: number): string {
  return n > 0 ? `+${formatPoints(n)}` : formatPoints(n)
}

/** "2h 05m 09s" / "4m 09s" — time left until tip-off. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${sec}s` : `${m}m ${sec}s`
}

/** "7:30 AM PHT" */
export function formatTipoffTime(d: Date): string {
  return (
    d.toLocaleTimeString('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }) +
    ` ${TIME_ZONE_LABEL}`
  )
}

/** 'YYYY-MM-DD' (a calendar date) → "Wed, Nov 11" */
export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** "just now", "12 min ago", "3 h ago", "2 d ago" */
export function formatRelative(then: Date, now: Date): string {
  const min = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}
