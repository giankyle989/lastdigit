const ET = 'America/New_York'

export function formatTipoff(d: Date): string {
  return (
    d.toLocaleString('en-US', {
      timeZone: ET,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  )
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', { timeZone: ET, dateStyle: 'medium', timeStyle: 'short' }) + ' ET'
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

/** "7:30 PM ET" */
export function formatTipoffTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }) + ' ET'
}

/** 'YYYY-MM-DD' (an ET date) → "Wed, Nov 11" */
export function formatEtDay(etDate: string): string {
  return new Date(`${etDate}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
