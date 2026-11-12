import { isLocalDate, localDayRange } from './dates'

/** Suspension end date from the form: '' → null (indefinite), 'YYYY-MM-DD' → 00:00 PHT of that date. */
export function parseSuspendUntil(value: string): Date | null | 'invalid' {
  if (!value) return null
  return isLocalDate(value) ? localDayRange(value).start : 'invalid'
}
