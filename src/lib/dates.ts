/** The one display and day-grouping time zone: Philippine time. Never hard-code a zone elsewhere. */
export const TIME_ZONE = 'Asia/Manila'
export const TIME_ZONE_LABEL = 'PHT'

// Calendar dates are 'YYYY-MM-DD' strings in TIME_ZONE; the offset logic below works for any zone.

const DAY_MS = 86_400_000
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

export type StripDay = { date: string; label: string }

/** The calendar date (in TIME_ZONE) of an instant. */
export function localDateOf(date: Date): string {
  return dateFormatter.format(date)
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isLocalDate(value: string): boolean {
  if (!LOCAL_DATE.test(value)) return false
  // Bound the year so hostile params like ?to=9999-12-31 can't produce dates the DB rejects.
  const year = Number(value.slice(0, 4))
  if (year < 2000 || year > 2099) return false
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Add `days` to a 'YYYY-MM-DD' date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Milliseconds TIME_ZONE is ahead of UTC at `at` (+8h for Asia/Manila). */
function offsetMs(at: Date): number {
  const parts = partsFormatter.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The UTC instant of 00:00 TIME_ZONE on `date`. */
function localMidnightUtc(date: string): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`)
  let t = utcMidnight - offsetMs(new Date(utcMidnight))
  t = utcMidnight - offsetMs(new Date(t)) // second pass settles the offset for zones with DST
  return new Date(t)
}

/** [start, end) in UTC of a calendar day in TIME_ZONE. */
export function localDayRange(date: string): { start: Date; end: Date } {
  return { start: localMidnightUtc(date), end: localMidnightUtc(addDays(date, 1)) }
}

/** Yesterday, Today and the next 6 days (spec §4.1). */
export function dateStrip(now: Date): StripDay[] {
  const today = localDateOf(now)
  return Array.from({ length: 8 }, (_, i) => {
    const date = addDays(today, i - 1)
    return { date, label: i === 0 ? 'Yesterday' : i === 1 ? 'Today' : shortDayLabel(date) }
  })
}

/** "Fri 13" */
export function shortDayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${d.getUTCDate()}`
}

/** A `?date=` value if it is a valid date inside the strip, otherwise Today. */
export function parseStripDate(raw: unknown, now: Date): string {
  const today = localDateOf(now)
  if (typeof raw !== 'string' || !isLocalDate(raw)) return today
  return dateStrip(now).some((d) => d.date === raw) ? raw : today
}
