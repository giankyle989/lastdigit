import { createHmac } from 'node:crypto'

import type { SightingKind } from '@prisma/client'

import { prisma } from '@/lib/db'

export type Seen = { deviceId: string | null; ip: string }
export type LinkedAccount = { id: string; username: string; sameDevice: boolean; sameNetwork: boolean }

function fingerprint(kind: SightingKind, value: string): string {
  const key = process.env.AUTH_SECRET
  if (!key) throw new Error('AUTH_SECRET is not set')
  return createHmac('sha256', key).update(`${kind}:${value}`).digest('hex')
}

/** Records that this account was seen on this device and network (hashed; spec §3.3). */
export async function recordSighting(userId: string, seen: Seen, now: Date = new Date()): Promise<void> {
  const entries: [SightingKind, string][] = []
  if (seen.deviceId) entries.push(['DEVICE', seen.deviceId])
  if (seen.ip && seen.ip !== 'unknown') entries.push(['NETWORK', seen.ip])
  for (const [kind, value] of entries) {
    const fp = fingerprint(kind, value)
    await prisma.accountSighting.upsert({
      where: { userId_kind_fingerprint: { userId, kind, fingerprint: fp } },
      create: { userId, kind, fingerprint: fp, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now },
    })
  }
}

const SIGNUP_WINDOW_MS = 3_600_000

/**
 * True while fewer than `limit` accounts were created on this network in the past hour. Counts
 * signup sightings in the database, so the limit holds across server instances and restarts.
 * An unknown network is never blocked: it cannot be told apart from other unknown visitors.
 */
export async function signupAllowed(ip: string, limit: number, now: Date = new Date()): Promise<boolean> {
  if (!ip || ip === 'unknown') return true
  const since = new Date(now.getTime() - SIGNUP_WINDOW_MS)
  const recent = await prisma.accountSighting.count({
    where: {
      kind: 'NETWORK',
      fingerprint: fingerprint('NETWORK', ip),
      firstSeenAt: { gte: since },
      user: { createdAt: { gte: since } },
    },
  })
  return recent < limit
}

/** Same as recordSighting, for a login where only the username is known. */
export async function recordLoginSighting(username: string, seen: Seen): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { usernameKey: username.trim().toLowerCase() },
    select: { id: true },
  })
  if (user) await recordSighting(user.id, seen)
}

/** Other players seen on one of this account's devices or networks, by username. */
export async function linkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const mine = await prisma.accountSighting.findMany({
    where: { userId },
    select: { kind: true, fingerprint: true },
  })
  if (mine.length === 0) return []
  const others = await prisma.accountSighting.findMany({
    where: {
      userId: { not: userId },
      user: { role: 'PLAYER' },
      OR: mine.map((s) => ({ kind: s.kind, fingerprint: s.fingerprint })),
    },
    select: { kind: true, user: { select: { id: true, username: true } } },
  })
  const byId = new Map<string, LinkedAccount>()
  for (const o of others) {
    const link = byId.get(o.user.id) ?? { ...o.user, sameDevice: false, sameNetwork: false }
    if (o.kind === 'DEVICE') link.sameDevice = true
    else link.sameNetwork = true
    byId.set(o.user.id, link)
  }
  return [...byId.values()].sort((a, b) => a.username.localeCompare(b.username))
}

/** Players who share at least one device with another player. */
export async function sharedDevicePlayerIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT s."userId"
    FROM "AccountSighting" s
    JOIN "User" u ON u.id = s."userId" AND u.role = 'PLAYER'
    WHERE s.kind = 'DEVICE'
      AND EXISTS (
        SELECT 1 FROM "AccountSighting" o
        JOIN "User" ou ON ou.id = o."userId" AND ou.role = 'PLAYER'
        WHERE o.kind = 'DEVICE' AND o.fingerprint = s.fingerprint AND o."userId" <> s."userId"
      )`
  return rows.map((r) => r.userId)
}
