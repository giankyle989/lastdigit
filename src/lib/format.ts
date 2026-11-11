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
