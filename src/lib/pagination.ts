export type Page<T> = { rows: T[]; total: number; page: number; pageCount: number }

/** Search-param value → first string (Next passes string | string[] | undefined). */
export function firstParam(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return undefined
}

/** `?page=` → a whole number ≥ 1; anything else falls back to 1 (spec §5.2). */
export function parsePage(raw: unknown): number {
  const v = firstParam(raw)?.trim()
  if (!v || !/^\d{1,6}$/.test(v)) return 1
  return Math.max(1, Number(v))
}

/** Clamps `page` into [1, pageCount] and returns the Prisma skip/take for it. */
export function pageWindow(total: number, page: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, page), pageCount)
  return { page: current, pageCount, skip: (current - 1) * size, take: size }
}
