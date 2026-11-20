/** A positive whole number from an env value, else `fallback`. */
export function positiveIntOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}
