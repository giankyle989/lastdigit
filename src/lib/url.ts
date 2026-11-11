import type { SearchParams } from './table-params'

/**
 * `basePath` + the current search params with `patch` applied (`undefined` removes a key).
 * Array values keep their first entry. Keys are emitted in insertion order.
 */
export function hrefWith(
  basePath: string,
  current: SearchParams,
  patch: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    const v = Array.isArray(value) ? value[0] : value
    if (v !== undefined && v !== '' && !(key in patch)) params.set(key, v)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Nav highlighting: `/games/abc` is inside `/games`; with `exact`, only the path itself matches. */
export function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
