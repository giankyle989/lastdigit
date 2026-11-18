import { randomBytes } from 'node:crypto'

import { cookies, headers } from 'next/headers'

// Must match CLIENT_IP_HEADER in server.mjs, which overwrites it on every request.
const CLIENT_IP_HEADER = 'x-lastdigit-client-ip'
const DEVICE_COOKIE = 'ld_device'
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/
const TWO_YEARS_S = 2 * 365 * 24 * 60 * 60

/** The real client IP stamped by server.mjs; 'unknown' under `next dev` or tests. */
export async function clientIp(): Promise<string> {
  return (await headers()).get(CLIENT_IP_HEADER)?.trim() || 'unknown'
}

/**
 * This browser's device ID, creating the cookie on first use. Only call from a server action
 * (cookies can be set there). Null if the cookie cannot be set.
 */
export async function deviceId(): Promise<string | null> {
  const jar = await cookies()
  const existing = jar.get(DEVICE_COOKIE)?.value
  if (existing && DEVICE_ID.test(existing)) return existing
  const id = randomBytes(16).toString('base64url')
  try {
    const https = (await headers()).get('x-forwarded-proto') === 'https'
    jar.set(DEVICE_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: https,
      path: '/',
      maxAge: TWO_YEARS_S,
    })
  } catch (e) {
    console.warn('device cookie: could not set it', e)
    return null
  }
  return id
}
