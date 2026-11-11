import { z } from 'zod'

/** Integer from a form field: accepts numbers or digits-only strings; never coerces '' to 0. */
export function intFromForm(label: string, min: number, max: number) {
  const msg = `${label} must be a whole number`
  return z.preprocess(
    (v) => {
      if (typeof v === 'string') {
        const t = v.trim()
        return /^\d+$/.test(t) ? Number(t) : Number.NaN
      }
      return v
    },
    z
      .number({ invalid_type_error: msg, required_error: `${label} is required` })
      .int(msg)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`),
  )
}
