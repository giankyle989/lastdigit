import { ZodError } from 'zod'

import { DomainError } from './errors'

export type ActionState = { error?: string; ok?: string; pickIndex?: number }

export async function runAction<T>(
  fn: () => Promise<T>,
  ok?: string | ((result: T) => string),
): Promise<ActionState> {
  try {
    const result = await fn()
    return { ok: typeof ok === 'function' ? ok(result) : (ok ?? 'Done') }
  } catch (e) {
    if (e instanceof DomainError) {
      return e.pickIndex === undefined ? { error: e.message } : { error: e.message, pickIndex: e.pickIndex }
    }
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? 'Invalid input' }
    throw e
  }
}
