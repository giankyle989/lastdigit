import { ZodError } from 'zod'
import { DomainError } from './errors'

export type ActionState = { error?: string; ok?: string }

export async function runAction<T>(
  fn: () => Promise<T>,
  ok?: string | ((result: T) => string),
): Promise<ActionState> {
  try {
    const result = await fn()
    return { ok: typeof ok === 'function' ? ok(result) : (ok ?? 'Done') }
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message }
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? 'Invalid input' }
    throw e
  }
}
