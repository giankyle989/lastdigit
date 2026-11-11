import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listFiles } from '../architecture/rules'

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

// Pages that render the Log out form import next-auth, which does not load under Vitest.
vi.mock('@/app/(auth)/actions', () => ({
  loginAction: vi.fn(),
  signupAction: vi.fn(),
  logoutAction: vi.fn(),
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

type PageCase = [string, () => Promise<{ default: (p: never) => Promise<unknown> }>, object]

const sp = (v: object = {}) => ({ searchParams: Promise.resolve(v) })
const params = (v: object) => ({ params: Promise.resolve(v), searchParams: Promise.resolve({}) })

// Keys are the page's path under src/app (without /page.tsx); the last test checks none is missing.
const adminPages: PageCase[] = [
  ['admin', () => import('@/app/admin/page'), sp()],
  ['admin/players', () => import('@/app/admin/players/page'), sp()],
  ['admin/players/[id]', () => import('@/app/admin/players/[id]/page'), params({ id: 'x' })],
  ['admin/games', () => import('@/app/admin/games/page'), sp()],
  ['admin/transactions', () => import('@/app/admin/transactions/page'), sp()],
  ['admin/inquiries', () => import('@/app/admin/inquiries/page'), sp()],
  ['admin/inquiries/[id]', () => import('@/app/admin/inquiries/[id]/page'), params({ id: 'x' })],
  ['admin/settings', () => import('@/app/admin/settings/page'), sp()],
]

const playerPages: PageCase[] = [
  ['(player)/bets', () => import('@/app/(player)/bets/page'), sp()],
  ['(player)/games', () => import('@/app/(player)/games/page'), sp()],
  ['(player)/games/[id]', () => import('@/app/(player)/games/[id]/page'), params({ id: 'x' })],
  ['(player)/inquiries', () => import('@/app/(player)/inquiries/page'), sp()],
  ['(player)/inquiries/[id]', () => import('@/app/(player)/inquiries/[id]/page'), params({ id: 'x' })],
  ['(player)/more', () => import('@/app/(player)/more/page'), sp()],
  ['(player)/referral', () => import('@/app/(player)/referral/page'), sp()],
  ['(player)/wallet', () => import('@/app/(player)/wallet/page'), sp()],
]

const pageKey = (file: string) => file.replace(/^src\/app\//, '').replace(/\/page\.tsx$/, '')

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
    '%s rejects before any data access when requireUser throws',
    async (_n, load, props) => {
      const mod = await load()
      await expect(mod.default(props as never)).rejects.toBe(SENTINEL)
      expect(dataSpies.calls).toEqual([])
    },
  )

  it('covers every admin and player page', () => {
    const onDisk = [
      ...listFiles('src/app/admin', /^page\.tsx$/),
      ...listFiles('src/app/(player)', /^page\.tsx$/),
    ].map(pageKey)
    const listed = [...adminPages, ...playerPages].map(([key]) => key)
    expect(listed.sort()).toEqual(onDisk.sort())
  })
})
