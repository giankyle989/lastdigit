import { z } from 'zod'

export const PHONE_HINT = 'Enter a PH mobile number, e.g. 0917 123 4567'

// Optional country code (63, +63) or trunk 0, then a 10-digit mobile number starting with 9.
const PH_MOBILE = /^(?:\+63|63|0)?(9\d{9})$/

/** A PH mobile number in E.164 (`+639XXXXXXXXX`), or null. Spaces and dashes are ignored. */
export function parsePhPhone(input: string): string | null {
  const m = PH_MOBILE.exec(input.replace(/[\s-]/g, ''))
  return m ? `+63${m[1]}` : null
}

/** `+639171234567` → `0917 123 4567`. */
export function formatPhPhone(e164: string): string {
  const local = `0${e164.slice(3)}`
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
}

export const phoneSchema = z.string({ required_error: PHONE_HINT }).transform((v, ctx) => {
  const phone = parsePhPhone(v)
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_HINT })
    return z.NEVER
  }
  return phone
})
