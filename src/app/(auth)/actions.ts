'use server'

import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { AuthError } from 'next-auth'

import { signIn, signOut } from '@/auth'
import { type ActionState, runAction } from '@/lib/action-state'
import { createRateLimiter, positiveIntOr } from '@/lib/rate-limit'
import { recordLoginSighting, recordSighting, type Seen } from '@/server/sightings'
import { registerPlayer } from '@/server/users'

import { clientIp, deviceId } from '../request-info'

/** Sightings never block signup or login (spec §3.3). */
async function safely(record: () => Promise<void>): Promise<void> {
  try {
    await record()
  } catch (e) {
    console.error('account sighting: could not record', e)
  }
}

async function seenNow(): Promise<Seen> {
  return { deviceId: await deviceId(), ip: await clientIp() }
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const seen = await seenNow()
  try {
    await signIn('credentials', {
      username: String(fd.get('username') ?? ''),
      password: String(fd.get('password') ?? ''),
      redirectTo: '/',
    })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Invalid username or password, or the account is suspended.' }
    if (isRedirectError(e)) await safely(() => recordLoginSighting(String(fd.get('username') ?? ''), seen))
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

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const seen = await seenNow()
  const ip = seen.ip
  const limiter = signupLimiter()
  if (!limiter.allows(ip)) return { error: 'Too many new accounts from this network. Try again later.' }
  const username = String(fd.get('username') ?? '')
  const password = String(fd.get('password') ?? '')
  let userId: string | undefined
  const result = await runAction(async () => {
    userId = (
      await registerPlayer({
        username,
        password,
        phone: String(fd.get('phone') ?? ''),
        referralCode: String(fd.get('referralCode') ?? ''),
      })
    ).id
  })
  if (result.error) return result
  limiter.record(ip)
  if (userId) {
    const id = userId
    await safely(() => recordSighting(id, seen))
  }
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
