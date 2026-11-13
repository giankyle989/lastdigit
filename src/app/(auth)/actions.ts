'use server'

import { headers } from 'next/headers'
import { AuthError } from 'next-auth'

import { signIn, signOut } from '@/auth'
import { type ActionState, runAction } from '@/lib/action-state'
import { createRateLimiter, positiveIntOr } from '@/lib/rate-limit'
import { registerPlayer } from '@/server/users'

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await signIn('credentials', {
      username: String(fd.get('username') ?? ''),
      password: String(fd.get('password') ?? ''),
      redirectTo: '/',
    })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Invalid username or password, or the account is suspended.' }
    throw e // NEXT_REDIRECT on success
  }
  return {}
}

// Accounts created per client IP per hour; slows down farming referral and signup bonuses.
const SIGNUP_KEY = Symbol.for('lastdigit.signupLimiter')
type WithLimiter = typeof globalThis & { [SIGNUP_KEY]?: ReturnType<typeof createRateLimiter> }
function signupLimiter() {
  const g = globalThis as WithLimiter
  g[SIGNUP_KEY] ??= createRateLimiter({
    limit: positiveIntOr(process.env.SIGNUP_LIMIT_PER_HOUR, 5),
    windowMs: 3_600_000,
  })
  return g[SIGNUP_KEY]
}

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp()
  const limiter = signupLimiter()
  if (!limiter.allows(ip)) return { error: 'Too many new accounts from this network. Try again later.' }
  const username = String(fd.get('username') ?? '')
  const password = String(fd.get('password') ?? '')
  const result = await runAction(() =>
    registerPlayer({ username, password, referralCode: String(fd.get('referralCode') ?? '') }),
  )
  if (result.error) return result
  limiter.record(ip)
  try {
    await signIn('credentials', { username, password, redirectTo: '/' })
  } catch (e) {
    if (e instanceof AuthError)
      return { error: 'Account created, but automatic login failed. Please log in.' }
    throw e
  }
  return {}
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' })
}
