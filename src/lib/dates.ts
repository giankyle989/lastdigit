/** US Eastern ("ET") calendar dates as 'YYYY-MM-DD' strings. DST-safe. */
export const ET = 'America/New_York'

const DAY_MS = 86_400_000
const ET_DATE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

export type StripDay = { date: string; label: string }

/** The ET calendar date of an instant. */
export function etDateOf(date: Date): string {
  return dateFormatter.format(date)
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isEtDate(value: string): boolean {
  if (!ET_DATE.test(value)) return false
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function addEtDays(etDate: string, days: number): string {
  return new Date(Date.parse(`${etDate}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Milliseconds ET is ahead of UTC at `at` (negative: -4h in EDT, -5h in EST). */
function etOffsetMs(at: Date): number {
  const parts = partsFormatter.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The UTC instant of 00:00 ET on `etDate`. US DST switches at 02:00, so midnight is never ambiguous. */
function etMidnightUtc(etDate: string): Date {
  const utcMidnight = Date.parse(`${etDate}T00:00:00Z`)
  let t = utcMidnight - etOffsetMs(new Date(utcMidnight))
  t = utcMidnight - etOffsetMs(new Date(t)) // second pass settles the offset near a DST switch
  return new Date(t)
}

/** [start, end) in UTC of an ET calendar day (23 or 25 hours long on DST days). */
export function etDayRange(etDate: string): { start: Date; end: Date } {
  return { start: etMidnightUtc(etDate), end: etMidnightUtc(addEtDays(etDate, 1)) }
}

/** Yesterday, Today and the next 6 days (spec §4.1). */
export function etDateStrip(now: Date): StripDay[] {
  const today = etDateOf(now)
  return Array.from({ length: 8 }, (_, i) => {
    const date = addEtDays(today, i - 1)
    return { date, label: i === 0 ? 'Yesterday' : i === 1 ? 'Today' : shortDayLabel(date) }
  })
}

/** "Fri 13" */
export function shortDayLabel(etDate: string): string {
  const d = new Date(`${etDate}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${d.getUTCDate()}`
}

/** A `?date=` value if it is a valid date inside the strip, otherwise Today. */
export function parseStripDate(raw: unknown, now: Date): string {
  const today = etDateOf(now)
  if (typeof raw !== 'string' || !isEtDate(raw)) return today
  return etDateStrip(now).some((d) => d.date === raw) ? raw : today
}
