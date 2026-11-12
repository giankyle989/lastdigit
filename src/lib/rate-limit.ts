/**
 * In-memory sliding-window limiter: at most `limit` recorded events per key within `windowMs`.
 * Per server process — fine for a single long-running instance.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const events = new Map<string, number[]>()

  function recent(key: string, now: number): number[] {
    const kept = (events.get(key) ?? []).filter((t) => now - t < windowMs)
    if (kept.length === 0) events.delete(key)
    else events.set(key, kept)
    return kept
  }

  return {
    /** True while `key` is under the limit. */
    allows(key: string, now: number = Date.now()): boolean {
      return recent(key, now).length < limit
    },
    record(key: string, now: number = Date.now()): void {
      events.set(key, [...recent(key, now), now])
    },
  }
}

/** A positive whole number from an env value, else `fallback`. */
export function positiveIntOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}
