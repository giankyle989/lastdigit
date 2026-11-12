import { isLocalDate, localDayRange } from './dates'
import { firstParam } from './pagination'

/** Rows per admin table page (spec §5.2). */
export const TABLE_PAGE_SIZE = 25

export type SearchParams = Record<string, string | string[] | undefined>
export type Sort<F extends string> = { field: F; dir: 'asc' | 'desc' }

/** `?sort=field` / `?sort=-field` against a whitelist; anything else → the fallback (spec §5.2). */
export function parseSort<F extends string>(raw: unknown, allowed: readonly F[], fallback: Sort<F>): Sort<F> {
  const v = firstParam(raw)?.trim() ?? ''
  const desc = v.startsWith('-')
  const name = desc ? v.slice(1) : v
  const field = allowed.find((f) => f === name)
  return field ? { field, dir: desc ? 'desc' : 'asc' } : fallback
}

export function formatSort<F extends string>(sort: Sort<F>): string {
  return sort.dir === 'desc' ? `-${sort.field}` : sort.field
}

/** `?q=` → trimmed text (max 100 chars) or undefined. */
export function parseSearch(raw: unknown): string | undefined {
  const v = firstParam(raw)?.trim().slice(0, 100)
  return v ? v : undefined
}

/** A value from a fixed list, or undefined (`all`, junk and missing all mean "no filter"). */
export function parseOption<T extends string>(raw: unknown, options: readonly T[]): T | undefined {
  const v = firstParam(raw)
  return options.find((o) => o === v)
}

/** `?from=` / `?to=` → a valid 'YYYY-MM-DD' date or undefined. */
export function parseDateParam(raw: unknown): string | undefined {
  const v = firstParam(raw)
  return v && isLocalDate(v) ? v : undefined
}

/** Inclusive date range → [from 00:00 PHT, day after `to` 00:00 PHT) bounds, or undefined. */
export function dateBounds(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: localDayRange(from).start } : {}),
    ...(to ? { lt: localDayRange(to).end } : {}),
  }
}

/** Header click: same field flips direction; a new field starts ascending. */
export function toggleSort(current: string, field: string): string {
  return current === field ? `-${field}` : field
}

/** Drawer ids (`?player=` etc.): plausible record ids only; anything else is "Not found". */
export function isRecordId(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}
