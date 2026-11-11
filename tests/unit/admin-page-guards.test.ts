import { beforeEach, describe, expect, it, vi } from 'vitest'

const SENTINEL = new Error('GUARD_SENTINEL')

vi.mock('@/server/session', () => ({
  requireAdmin: vi.fn(async () => {
    throw SENTINEL
  }),
  requireUser: vi.fn(async () => {
    throw SENTINEL
  }),
  getCurrentUser: vi.fn(async () => null),
}))

// Any data access (Prisma) before the guard is a bug: record it.
const dataSpies = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('@/lib/db', () => ({
  prisma: new Proxy(
    {},
    {
      get(_t, prop) {
        dataSpies.calls.push(String(prop))
        throw new Error(`prisma.${String(prop)} accessed before auth guard`)
      },
    },
  ),
}))

const adminPages: [string, () => Promise<{ default: (p: never) => Promise<unknown> }>, object][] = [
  ['admin/page', () => import('@/app/admin/page'), {}],
  ['admin/players', () => import('@/app/admin/players/page'), { searchParams: Promise.resolve({}) }],
  [
    'admin/players/[id]',
    () => import('@/app/admin/players/[id]/page'),
    { params: Promise.resolve({ id: 'x' }) },
  ],
  ['admin/games', () => import('@/app/admin/games/page'), { searchParams: Promise.resolve({}) }],
  [
    'admin/transactions',
    () => import('@/app/admin/transactions/page'),
    { searchParams: Promise.resolve({}) },
  ],
  ['admin/inquiries', () => import('@/app/admin/inquiries/page'), { searchParams: Promise.resolve({}) }],
  [
    'admin/inquiries/[id]',
    () => import('@/app/admin/inquiries/[id]/page'),
    { params: Promise.resolve({ id: 'x' }) },
  ],
  ['admin/settings', () => import('@/app/admin/settings/page'), {}],
]

const playerPages: [string, () => Promise<{ default: (p: never) => Promise<unknown> }>, object][] = [
  ['bets', () => import('@/app/(player)/bets/page'), { searchParams: Promise.resolve({}) }],
  ['games', () => import('@/app/(player)/games/page'), {}],
  ['games/[id]', () => import('@/app/(player)/games/[id]/page'), { params: Promise.resolve({ id: 'x' }) }],
  ['inquiries', () => import('@/app/(player)/inquiries/page'), {}],
  [
    'inquiries/[id]',
    () => import('@/app/(player)/inquiries/[id]/page'),
    { params: Promise.resolve({ id: 'x' }) },
  ],
  ['referral', () => import('@/app/(player)/referral/page'), {}],
  ['wallet', () => import('@/app/(player)/wallet/page'), {}],
]

describe('page-level auth guards (layout guards can be skipped by RSC requests)', () => {
  beforeEach(() => {
    dataSpies.calls.length = 0
  })

  it.each(adminPages)(
    '%s rejects before any data access when requireAdmin throws',
    async (_n, load, props) => {
      const mod = await load()
      await expect(mod.default(props as never)).rejects.toBe(SENTINEL)
      expect(dataSpies.calls).toEqual([])
    },
  )

  it.each(playerPages)(
    '(player)/%s rejects before any data access when requireUser throws',
    async (_n, load, props) => {
      const mod = await load()
      await expect(mod.default(props as never)).rejects.toBe(SENTINEL)
      expect(dataSpies.calls).toEqual([])
    },
  )
})
