# Admin Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split staff into superadmin and manager, gate every admin page, action and server function
by a permission table, and give the superadmin a staff page to manage managers.

**Architecture:** A pure permission table (`src/lib/permissions.ts`) answers `can(role, permission)`.
Pages and actions call `requireAdmin(permission)`; server functions call `assertCan(db, actorId,
permission)` so the rule holds even when called another way. The staff page reuses the user
suspension fields to disable managers.

**Tech Stack:** Next.js 15 App Router, Prisma 6, Postgres, zod, Vitest (real Postgres), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-admin-levels-design.md`

## Global Constraints

- Roles are exactly `PLAYER`, `MANAGER`, `SUPERADMIN`; `ADMIN` is renamed (not copied) to `SUPERADMIN`.
- Permissions are exactly `console.view`, `points.adjust`, `players.manage`, `support.answer`,
  `games.manage`, `settings.manage`, `staff.manage`. Managers get the first four; superadmin all.
- Every admin page and exported admin server action calls `await requireAdmin(...)` itself
  (CLAUDE.md rule 2; `tests/architecture.test.ts` checks the `await requireAdmin(` text).
- No staff role → redirect `/`; staff without the permission → redirect `/admin`.
- Server functions refuse with `DomainError('FORBIDDEN', 'You do not have permission to do that')`.
- Manager-hidden controls are **hidden, not disabled**: Settings and Staff nav items, Force sync,
  Void game.
- `src/server` must not import `next/*` (except `session.ts`); `src/lib` stays pure.
- **The dev `.env` database is the live database.** Never run `prisma migrate deploy`/`dev`
  against `.env`. Tests and e2e migrate `lastdigit_test` themselves (via `.env.test`). Do not
  restart `lastdigit.service`. The live DB is migrated at deploy only.
- Never `prisma migrate reset`, `--no-verify`, `HUSKY=0`; Conventional Commits, body lines ≤ 100;
  no AI attribution in commits.
- `npm run check` must pass at the end of every task; `npm run test:e2e` at the end of Task 4.

## Review Focus

1. A manager typing `/admin/settings` or `/admin/staff` into the address bar → lands on `/admin`,
   no data shown. (Task 3 e2e step; Task 3 page-guard list.)
2. A disabled manager who is still logged in → signed out on the next request. (Task 4:
   `isSuspended(manager)` is true after disable.)
3. A player signing up with a staff account's referral code → "Referral code not found", so staff
   never earn referral bonuses. (Task 1 users test.)
4. A superadmin trying to disable, enable or reset another superadmin or themselves → `FORBIDDEN`,
   nothing changes. (Task 4 test.)
5. A server function called with a manager's id for a superadmin-only job (void, bonuses) or with a
   player's id for any staff job → `FORBIDDEN` before any write. (Task 2 tests.)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/20261118000002_admin_levels/migration.sql` | `Role` enum |
| `prisma/seed.ts` | seeds the superadmin |
| `src/lib/permissions.ts` (new) | `PERMISSIONS`, `Permission`, `can`, `isStaff` |
| `src/lib/errors.ts` | `FORBIDDEN` code |
| `src/server/authz.ts` (new) | `assertCan(db, actorId, permission)` |
| `src/server/session.ts` | `requireAdmin(permission?)` |
| `src/server/staff.ts` (new) | staff list / create / disable / reset |
| `src/server/admin/players.ts`, `settlement.ts`, `settings.ts`, `inquiries.ts`, `users.ts` | actor checks; staff instead of `'ADMIN'`; referrer must be a player |
| `src/server/audit.ts` | four staff audit actions |
| `src/app/admin/**`, `src/components/admin/admin-nav.tsx` | per-permission guards, hidden controls, nav, staff page |
| `src/app/page.tsx`, `src/app/(player)/layout.tsx`, `src/components/support/chat-thread.tsx` | staff instead of `'ADMIN'` |
| `e2e/helpers.ts` (new), `e2e/staff.spec.ts` (new) | shared login helpers; manager flow |

---

### Task 1: Roles, permission table and the rename

**Files:**
- Modify: `prisma/schema.prisma` (`enum Role`), `prisma/seed.ts`
- Create: `prisma/migrations/20261118000002_admin_levels/migration.sql`
- Create: `src/lib/permissions.ts`, `tests/unit/permissions.test.ts`
- Modify: `src/lib/errors.ts`, `src/server/inquiries.ts`, `src/server/users.ts`, `src/app/page.tsx`,
  `src/app/(player)/layout.tsx`, `src/components/support/chat-thread.tsx`
- Modify: every `role: 'ADMIN'` in `tests/**` → `role: 'SUPERADMIN'`
- Test: `tests/integration/inquiries.test.ts`, `tests/integration/users.test.ts`

**Interfaces:**
- Produces: `type Permission`; `PERMISSIONS: readonly Permission[]`;
  `can(role: Role, permission: Permission): boolean`; `isStaff(role: Role): boolean`;
  `DomainErrorCode` gains `'FORBIDDEN'`.

- [ ] **Step 1: Write the failing unit test** `tests/unit/permissions.test.ts`

```ts
import { describe, expect, it } from 'vitest'

import { can, isStaff, type Permission, PERMISSIONS } from '@/lib/permissions'

const MANAGER_ALLOWED: Permission[] = ['console.view', 'points.adjust', 'players.manage', 'support.answer']

describe('permissions', () => {
  it.each(PERMISSIONS)('superadmin can %s', (p) => expect(can('SUPERADMIN', p)).toBe(true))
  it.each(PERMISSIONS)('player cannot %s', (p) => expect(can('PLAYER', p)).toBe(false))
  it.each(PERMISSIONS)('manager on %s matches the table', (p) =>
    expect(can('MANAGER', p)).toBe(MANAGER_ALLOWED.includes(p)),
  )
  it('lists exactly the seven permissions', () =>
    expect([...PERMISSIONS].sort()).toEqual(
      [
        'console.view',
        'games.manage',
        'players.manage',
        'points.adjust',
        'settings.manage',
        'staff.manage',
        'support.answer',
      ].sort(),
    ))
  it('isStaff', () => {
    expect(isStaff('SUPERADMIN')).toBe(true)
    expect(isStaff('MANAGER')).toBe(true)
    expect(isStaff('PLAYER')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/permissions.test.ts`
Expected: FAIL — cannot resolve `@/lib/permissions`.

- [ ] **Step 3: Schema, migration, client**

In `prisma/schema.prisma`:

```prisma
enum Role {
  PLAYER
  MANAGER
  SUPERADMIN
}
```

`prisma/migrations/20261118000002_admin_levels/migration.sql` (hand-written: a rename keeps the
existing admin rows; Prisma's generated SQL would drop and recreate the enum):

```sql
-- Existing admins become superadmins; managers are new.
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPERADMIN';
ALTER TYPE "Role" ADD VALUE 'MANAGER';
```

Run `npx prisma generate`. Do **not** run any migrate command against `.env`; the test run in
Step 6 applies it to `lastdigit_test` (`tests/global-setup.ts`).

- [ ] **Step 4: Permission table** `src/lib/permissions.ts`

```ts
import type { Role } from '@prisma/client'

export const PERMISSIONS = [
  'console.view',
  'points.adjust',
  'players.manage',
  'support.answer',
  'games.manage',
  'settings.manage',
  'staff.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const MANAGER_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'console.view',
  'points.adjust',
  'players.manage',
  'support.answer',
])

/** Managers and superadmins: anyone allowed into the admin console. */
export function isStaff(role: Role): boolean {
  return role === 'MANAGER' || role === 'SUPERADMIN'
}

export function can(role: Role, permission: Permission): boolean {
  if (role === 'SUPERADMIN') return true
  if (role === 'MANAGER') return MANAGER_PERMISSIONS.has(permission)
  return false
}
```

Add `| 'FORBIDDEN'` to `DomainErrorCode` in `src/lib/errors.ts`.

- [ ] **Step 5: Replace every `'ADMIN'` role check with staff**

- `prisma/seed.ts`: both `role: 'ADMIN'` → `role: 'SUPERADMIN'`.
- `src/app/page.tsx`: `redirect(isStaff(user.role) ? '/admin' : '/games')`.
- `src/app/(player)/layout.tsx`: `isAdmin={isStaff(user.role)}`.
- `src/components/support/chat-thread.tsx`: author role type becomes `Role` (import type from
  `@prisma/client`); label: `isStaff(m.author.role) ? 'Support' : m.author.username`. Keep the
  `viewer` prop as is.
- `src/server/inquiries.ts`: `!isStaff(actor.role) && inquiry.userId !== actorId` and
  `status: isStaff(actor.role) ? 'ANSWERED' : 'OPEN'`.
- `src/server/users.ts` registerPlayer: a referral code only counts if it belongs to a player:

```ts
const referrer = await tx.user.findUnique({ where: { referralCode } })
if (!referrer || referrer.role !== 'PLAYER') {
  throw new DomainError('INVALID_REFERRAL', 'Referral code not found')
}
```

- Tests: replace every `role: 'ADMIN'` in `tests/**` with `role: 'SUPERADMIN'`, and
  `toBe('ADMIN')` in `tests/integration/inquiries.test.ts` with `toBe('SUPERADMIN')`.
  Check with `grep -rn "'ADMIN'" src tests e2e prisma/seed.ts` → no matches.

- [ ] **Step 6: Add the integration tests**

In `tests/integration/inquiries.test.ts` (inside the existing `describe`, same helpers):

```ts
it('a manager answers a ticket like any staff member', async () => {
  const player = await makeUser()
  const manager = await makeUser({ role: 'MANAGER' })
  const inquiry = await createInquiry(player.id, { subject: 'Cash in', body: 'hi' })
  await replyToInquiry(manager.id, inquiry.id, { body: 'on it' })
  expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).status).toBe('ANSWERED')
  await closeInquiry(manager.id, inquiry.id)
  expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).status).toBe('CLOSED')
})
```

In `tests/integration/users.test.ts`:

```ts
it.each(['MANAGER', 'SUPERADMIN'] as const)('rejects a %s referral code', async (role) => {
  const staff = await makeUser({ role })
  await expect(
    registerPlayer({ username: `ref_${role}`, password: 'secret123', phone: '0917 555 0101', referralCode: staff.referralCode }),
  ).rejects.toMatchObject({ code: 'INVALID_REFERRAL' })
})
```

- [ ] **Step 7: Run everything**

Run: `npm run check`
Expected: PASS (format, lint, typecheck, all tests including the new ones).

- [ ] **Step 8: Commit**

```bash
git add prisma src tests
git commit -m "feat: superadmin and manager roles with a permission table"
```

---

### Task 2: Server-side permission checks

**Files:**
- Create: `src/server/authz.ts`
- Modify: `src/server/session.ts`, `src/server/admin/players.ts`, `src/server/settlement.ts`
  (`voidGame`), `src/server/settings.ts` (`setBonuses`)
- Test: `tests/integration/authz.test.ts` (new)

**Interfaces:**
- Consumes: `can`, `isStaff`, `Permission` (Task 1).
- Produces: `assertCan(db: Tx, actorId: string, permission: Permission): Promise<User>`;
  `requireAdmin(permission: Permission = 'console.view'): Promise<User>`.

- [ ] **Step 1: Write the failing test** `tests/integration/authz.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import {
  adjustPoints,
  confirmPhone,
  resetPassword,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { setBonuses } from '@/server/settings'
import { voidGame } from '@/server/settlement'

import { makeGame, makeUser, resetDb } from '../helpers/db'

const BONUSES = { welcomeBonusCap: 1000, referralPercent: 50, referralBonusCap: 200, dailyBonus: 0 }
const forbidden = { code: 'FORBIDDEN' }

describe('server permission checks', () => {
  beforeEach(resetDb)

  it('a manager can do player and points work', async () => {
    const manager = await makeUser({ role: 'MANAGER' })
    const player = await makeUser()
    await adjustPoints(manager.id, player.id, { direction: 'GRANT', amount: 100, note: 'cash in' })
    await adjustPoints(manager.id, player.id, { direction: 'DEDUCT', amount: 40, note: 'cash out' })
    await setStakeLimit(manager.id, player.id, 500)
    await suspendPlayer(manager.id, player.id, null)
    await unsuspendPlayer(manager.id, player.id)
    await resetPassword(manager.id, player.id, 'newpass123')
    // grant, deduct, stake limit, suspend, unsuspend, reset password (bonuses may add ledger rows)
    expect(await prisma.adminAction.count({ where: { adminId: manager.id } })).toBe(6)
  })

  it('a manager cannot void games or change bonuses, and nothing changes', async () => {
    const manager = await makeUser({ role: 'MANAGER' })
    const game = await makeGame()
    await expect(voidGame(manager.id, game.id, 'test')).rejects.toMatchObject(forbidden)
    await expect(setBonuses(manager.id, BONUSES)).rejects.toMatchObject(forbidden)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('SCHEDULED')
    expect(await prisma.adminAction.count()).toBe(0)
  })

  it('a superadmin can void games and change bonuses', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const game = await makeGame()
    await voidGame(boss.id, game.id, 'test')
    await setBonuses(boss.id, BONUSES)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('VOID')
  })

  it('a player id is refused for every staff job before any write', async () => {
    const actor = await makeUser()
    const target = await makeUser({ phoneConfirmedAt: null })
    await expect(
      adjustPoints(actor.id, target.id, { direction: 'GRANT', amount: 100, note: 'x' }),
    ).rejects.toMatchObject(forbidden)
    await expect(confirmPhone(actor.id, target.id)).rejects.toMatchObject(forbidden)
    await expect(suspendPlayer(actor.id, target.id, null)).rejects.toMatchObject(forbidden)
    expect(await prisma.adminAction.count()).toBe(0)
  })

  it('a suspended manager is refused', async () => {
    const manager = await makeUser({ role: 'MANAGER', status: 'SUSPENDED' })
    const player = await makeUser()
    await expect(
      adjustPoints(manager.id, player.id, { direction: 'GRANT', amount: 100, note: 'x' }),
    ).rejects.toMatchObject(forbidden)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/integration/authz.test.ts`
Expected: FAIL — managers are not refused yet (the void/bonuses/player cases do not throw).

- [ ] **Step 3: `src/server/authz.ts`**

```ts
import type { User } from '@prisma/client'

import type { Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { can, type Permission } from '@/lib/permissions'
import { isSuspended } from '@/lib/suspension'

/** Loads the acting staff member and refuses unless their role grants `permission`. */
export async function assertCan(db: Tx, actorId: string, permission: Permission): Promise<User> {
  const actor = await db.user.findUnique({ where: { id: actorId } })
  if (!actor || isSuspended(actor) || !can(actor.role, permission)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to do that')
  }
  return actor
}
```

(`Tx` must accept the root `prisma` client too; it already does for `getBonuses(db = prisma)`.)

- [ ] **Step 4: Call it first in each server function**

As the first statement (before validation-free writes, and before opening the transaction):

| Function | Permission |
| --- | --- |
| `adjustPoints` | `points.adjust` |
| `suspendPlayer`, `unsuspendPlayer`, `setStakeLimit`, `resetPassword`, `setPhone`, `confirmPhone` | `players.manage` |
| `voidGame` (`src/server/settlement.ts`) | `games.manage` |
| `setBonuses` (`src/server/settings.ts`) | `settings.manage` |

Example: `await assertCan(prisma, adminId, 'players.manage')`. `syncGames` gets no check (the
scheduler runs it with no actor); `forceSyncAction` is gated in Task 3. Inquiry functions keep
their own staff-or-owner rule from Task 1.

- [ ] **Step 5: `requireAdmin(permission)`** in `src/server/session.ts`

```ts
import { can, isStaff, type Permission } from '@/lib/permissions'

export async function requireAdmin(permission: Permission = 'console.view') {
  const user = await requireUser()
  if (!isStaff(user.role)) redirect('/')
  if (!can(user.role, permission)) redirect('/admin')
  return user
}
```

- [ ] **Step 6: Run everything**

Run: `npm run check`
Expected: PASS. If an existing test calls a guarded function with a non-staff or made-up actor id,
give it a `makeUser({ role: 'SUPERADMIN' })` actor instead; do not weaken `assertCan`.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: enforce staff permissions in admin server functions"
```

---

### Task 3: Console gating (pages, actions, nav, hidden controls)

**Files:**
- Modify: `src/app/admin/actions.ts`, `src/app/admin/layout.tsx`, `src/app/admin/settings/page.tsx`,
  `src/app/admin/games/page.tsx`, `src/app/admin/games/game-drawer.tsx`,
  `src/components/admin/admin-nav.tsx`
- Test: `tests/unit/admin-nav.test.ts` (new)

**Interfaces:**
- Consumes: `requireAdmin(permission)`, `can` (Tasks 1–2).
- Produces: `adminNavItems(role: Role)` exported from `src/components/admin/admin-nav.tsx`
  returning the visible `NAV` entries; nav item `{ href: '/admin/staff', label: 'Staff' }`
  (page added in Task 4).

- [ ] **Step 1: Write the failing test** `tests/unit/admin-nav.test.ts`

```ts
import { describe, expect, it } from 'vitest'

import { adminNavItems } from '@/components/admin/admin-nav'

const labels = (role: 'MANAGER' | 'SUPERADMIN') => adminNavItems(role).map((i) => i.label)

describe('admin nav', () => {
  it('managers see no Settings or Staff', () =>
    expect(labels('MANAGER')).toEqual(['Overview', 'Players', 'Games', 'Ledger', 'Support']))
  it('superadmins see everything', () =>
    expect(labels('SUPERADMIN')).toEqual([
      'Overview',
      'Players',
      'Games',
      'Ledger',
      'Support',
      'Settings',
      'Staff',
    ]))
})
```

(If importing the client component under Vitest fails because of `next/navigation`, move `NAV`
and `adminNavItems` to `src/components/admin/admin-nav-items.ts` without `'use client'` and
import that from both the component and the test.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/admin-nav.test.ts`
Expected: FAIL — `adminNavItems` is not exported.

- [ ] **Step 3: Nav filtered by role**

In `admin-nav.tsx`: each `NAV` entry gets a `permission: Permission` (`console.view` for the
first five, `settings.manage` for Settings, `staff.manage` for a new
`{ href: '/admin/staff', label: 'Staff', icon: UserCog, exact: false }`). Export:

```ts
export function adminNavItems(role: Role) {
  return NAV.filter((item) => can(role, item.permission))
}
```

`NavLinks`, `AdminSidebar` and `AdminMobileNav` take `role: Role` and render
`adminNavItems(role)`. `src/app/admin/layout.tsx` passes `role={admin.role}` to both.

- [ ] **Step 4: Actions and pages ask for their permission**

In `src/app/admin/actions.ts` (keep the literal `await requireAdmin(` form):

| Action | Call |
| --- | --- |
| `adjustPointsAction` | `requireAdmin('points.adjust')` |
| `suspendAction`, `unsuspendAction`, `stakeLimitAction`, `resetPasswordAction`, `setPhoneAction`, `confirmPhoneAction` | `requireAdmin('players.manage')` |
| `voidGameAction`, `forceSyncAction` | `requireAdmin('games.manage')` |
| `adminReplyAction`, `adminCloseAction` | `requireAdmin('support.answer')` |
| `bonusesAction` | `requireAdmin('settings.manage')` |

`src/app/admin/settings/page.tsx`: `await requireAdmin('settings.manage')`. Other pages keep
`await requireAdmin()`.

- [ ] **Step 5: Hide Force sync and Void game from managers**

- `games/page.tsx`: `const admin = await requireAdmin()`; render the Force sync `ActionForm` only
  when `can(admin.role, 'games.manage')`. Pass `canManageGames={can(admin.role, 'games.manage')}`
  down to `GameDrawer`.
- `game-drawer.tsx`: new prop `canManageGames: boolean`; render the void `ActionDialog` wrapper
  only when it is true (keep the existing hidden/contents wrapper inside that condition).

- [ ] **Step 6: Run everything**

Run: `npm run check`
Expected: PASS, including `tests/architecture.test.ts` and `tests/unit/admin-page-guards.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: gate the admin console by staff permission"
```

---

### Task 4: Staff page

**Files:**
- Create: `src/server/staff.ts`, `src/app/admin/staff/page.tsx`, `src/app/admin/staff/error.tsx`
  (copy `src/app/admin/settings/error.tsx`), `tests/integration/staff.test.ts`,
  `e2e/helpers.ts`, `e2e/staff.spec.ts`
- Modify: `src/server/audit.ts`, `src/app/admin/actions.ts`, `e2e/full-flow.spec.ts` (import helpers),
  `tests/unit/admin-page-guards.test.ts` (add the staff page)

**Interfaces:**
- Consumes: `assertCan`, `usernameSchema`, `passwordSchema`, `hashPassword`,
  `generateReferralCode`, `logAdminAction`.
- Produces:
  - `type StaffRow = { id: string; username: string; role: Role; disabled: boolean; lastSeenAt: Date | null }`
  - `listStaff(actorId: string): Promise<StaffRow[]>` (superadmins first, then by username)
  - `createManager(actorId: string, input: unknown): Promise<User>`
  - `setStaffDisabled(actorId: string, userId: string, disabled: boolean): Promise<void>`
  - `resetStaffPassword(actorId: string, userId: string, newPassword: unknown): Promise<void>`
  - Audit actions `CREATE_STAFF`, `DISABLE_STAFF`, `ENABLE_STAFF`, `RESET_STAFF_PASSWORD`.
  - Actions `createManagerAction`, `disableStaffAction(userId)`, `enableStaffAction(userId)`,
    `resetStaffPasswordAction(userId)`, all `await requireAdmin('staff.manage')`.

- [ ] **Step 1: Write the failing test** `tests/integration/staff.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { isSuspended } from '@/lib/suspension'
import { verifyPassword } from '@/server/passwords'
import { createManager, listStaff, resetStaffPassword, setStaffDisabled } from '@/server/staff'

import { makeUser, resetDb } from '../helpers/db'

const forbidden = { code: 'FORBIDDEN' }

describe('staff', () => {
  beforeEach(resetDb)

  it('a superadmin creates a manager who can log in', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const m = await createManager(boss.id, { username: 'Mila', password: 'temppass1' })
    expect(m.role).toBe('MANAGER')
    expect(m.phone).toBeNull()
    expect(await verifyPassword('temppass1', m.passwordHash)).toBe(true)
    const audit = await prisma.adminAction.findFirstOrThrow({ where: { action: 'CREATE_STAFF' } })
    expect(audit).toMatchObject({ adminId: boss.id, targetUserId: m.id })
  })

  it('refuses a taken username and bad input', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    await makeUser({ username: 'mila' })
    await expect(createManager(boss.id, { username: 'MILA', password: 'temppass1' })).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    })
    await expect(createManager(boss.id, { username: 'x', password: 'temppass1' })).rejects.toThrow()
    await expect(createManager(boss.id, { username: 'okname', password: 'short' })).rejects.toThrow()
  })

  it('disable signs the manager out; enable restores them', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const m = await makeUser({ role: 'MANAGER' })
    await setStaffDisabled(boss.id, m.id, true)
    expect(isSuspended(await prisma.user.findUniqueOrThrow({ where: { id: m.id } }))).toBe(true)
    await setStaffDisabled(boss.id, m.id, false)
    expect(isSuspended(await prisma.user.findUniqueOrThrow({ where: { id: m.id } }))).toBe(false)
    const actions = (await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.action)
    expect(actions).toEqual(['DISABLE_STAFF', 'ENABLE_STAFF'])
  })

  it('resets a manager password without logging it', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const m = await makeUser({ role: 'MANAGER' })
    await resetStaffPassword(boss.id, m.id, 'brandnew12')
    expect(await verifyPassword('brandnew12', (await prisma.user.findUniqueOrThrow({ where: { id: m.id } })).passwordHash)).toBe(true)
    const audit = await prisma.adminAction.findFirstOrThrow({ where: { action: 'RESET_STAFF_PASSWORD' } })
    expect(JSON.stringify(audit.details)).not.toContain('brandnew12')
  })

  it('never touches a superadmin, itself or a player', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN' })
    const other = await makeUser({ role: 'SUPERADMIN' })
    const player = await makeUser()
    for (const target of [boss, other, player]) {
      await expect(setStaffDisabled(boss.id, target.id, true)).rejects.toMatchObject(forbidden)
      await expect(resetStaffPassword(boss.id, target.id, 'brandnew12')).rejects.toMatchObject(forbidden)
    }
    expect(await prisma.adminAction.count()).toBe(0)
  })

  it('managers cannot use any staff function', async () => {
    const m = await makeUser({ role: 'MANAGER' })
    const m2 = await makeUser({ role: 'MANAGER' })
    await expect(listStaff(m.id)).rejects.toMatchObject(forbidden)
    await expect(createManager(m.id, { username: 'sneaky', password: 'temppass1' })).rejects.toMatchObject(forbidden)
    await expect(setStaffDisabled(m.id, m2.id, true)).rejects.toMatchObject(forbidden)
    await expect(resetStaffPassword(m.id, m2.id, 'brandnew12')).rejects.toMatchObject(forbidden)
  })

  it('lists staff only, with status and last seen', async () => {
    const boss = await makeUser({ role: 'SUPERADMIN', username: 'boss' })
    const m = await makeUser({ role: 'MANAGER', username: 'mila', status: 'SUSPENDED' })
    await makeUser({ username: 'player1' })
    const seen = new Date('2026-11-18T01:00:00Z')
    await prisma.accountSighting.create({
      data: { userId: m.id, kind: 'DEVICE', fingerprint: 'f', firstSeenAt: seen, lastSeenAt: seen },
    })
    expect(await listStaff(boss.id)).toEqual([
      { id: boss.id, username: 'boss', role: 'SUPERADMIN', disabled: false, lastSeenAt: null },
      { id: m.id, username: 'mila', role: 'MANAGER', disabled: true, lastSeenAt: seen },
    ])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/integration/staff.test.ts`
Expected: FAIL — cannot resolve `@/server/staff`.

- [ ] **Step 3: Audit types**

Append `'CREATE_STAFF'`, `'DISABLE_STAFF'`, `'ENABLE_STAFF'`, `'RESET_STAFF_PASSWORD'` to
`ADMIN_ACTION_TYPES` in `src/server/audit.ts`.

- [ ] **Step 4: `src/server/staff.ts`**

```ts
import { Prisma, type Role, type User } from '@prisma/client'
import { z } from 'zod'

import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'

import { logAdminAction } from './audit'
import { assertCan } from './authz'
import { hashPassword } from './passwords'
import { generateReferralCode } from './referral-code'
import { passwordSchema, usernameSchema } from './users'

export type StaffRow = { id: string; username: string; role: Role; disabled: boolean; lastSeenAt: Date | null }

const ROLE_ORDER: Record<Role, number> = { SUPERADMIN: 0, MANAGER: 1, PLAYER: 2 }

export async function listStaff(actorId: string): Promise<StaffRow[]> {
  await assertCan(prisma, actorId, 'staff.manage')
  const users = await prisma.user.findMany({
    where: { role: { in: ['SUPERADMIN', 'MANAGER'] } },
    include: { sightings: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } } },
  })
  return users
    .map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      disabled: isSuspended(u),
      lastSeenAt: u.sightings[0]?.lastSeenAt ?? null,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.username.localeCompare(b.username))
}

const createSchema = z.object({ username: usernameSchema, password: passwordSchema })

export async function createManager(actorId: string, input: unknown): Promise<User> {
  await assertCan(prisma, actorId, 'staff.manage')
  const { username, password } = createSchema.parse(input)
  const passwordHash = await hashPassword(password)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            usernameKey: username.toLowerCase(),
            passwordHash,
            role: 'MANAGER',
            referralCode: generateReferralCode(),
          },
        })
        await logAdminAction(tx, {
          adminId: actorId,
          action: 'CREATE_STAFF',
          targetUserId: user.id,
          details: { username },
        })
        return user
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = JSON.stringify(e.meta?.target ?? '')
        if (target.includes('usernameKey')) {
          throw new DomainError('USERNAME_TAKEN', 'That username is already taken')
        }
        if (target.includes('referralCode')) continue
      }
      throw e
    }
  }
  throw new Error('Could not generate a unique referral code')
}

/** Staff-page actions only ever change managers: never a superadmin, the actor, or a player. */
async function lockManager(tx: Tx, actorId: string, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ role: Role }[]>`SELECT role FROM "User" WHERE id = ${userId} FOR UPDATE`
  if (userId === actorId || rows[0]?.role !== 'MANAGER') {
    throw new DomainError('FORBIDDEN', 'Only managers can be changed here')
  }
}

export async function setStaffDisabled(actorId: string, userId: string, disabled: boolean): Promise<void> {
  await assertCan(prisma, actorId, 'staff.manage')
  await prisma.$transaction(async (tx) => {
    await lockManager(tx, actorId, userId)
    await tx.user.update({
      where: { id: userId },
      data: { status: disabled ? 'SUSPENDED' : 'ACTIVE', suspendedUntil: null },
    })
    await logAdminAction(tx, {
      adminId: actorId,
      action: disabled ? 'DISABLE_STAFF' : 'ENABLE_STAFF',
      targetUserId: userId,
    })
  })
}

export async function resetStaffPassword(actorId: string, userId: string, newPassword: unknown): Promise<void> {
  await assertCan(prisma, actorId, 'staff.manage')
  const passwordHash = await hashPassword(passwordSchema.parse(newPassword))
  await prisma.$transaction(async (tx) => {
    await lockManager(tx, actorId, userId)
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await logAdminAction(tx, { adminId: actorId, action: 'RESET_STAFF_PASSWORD', targetUserId: userId })
  })
}
```

(If `"User".role` needs a cast in raw SQL, select `role::text AS role`.)

- [ ] **Step 5: Run the integration test**

Run: `npx vitest run tests/integration/staff.test.ts`
Expected: PASS.

- [ ] **Step 6: Actions** (append to `src/app/admin/actions.ts`)

```ts
export async function createManagerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(
    () => createManager(admin.id, { username: fd.get('username'), password: fd.get('password') }),
    'Manager added',
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function disableStaffAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(() => setStaffDisabled(admin.id, userId, true), 'Manager disabled')
  revalidatePath('/admin', 'layout')
  return r
}

export async function enableStaffAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(() => setStaffDisabled(admin.id, userId, false), 'Manager enabled')
  revalidatePath('/admin', 'layout')
  return r
}

export async function resetStaffPasswordAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(() => resetStaffPassword(admin.id, userId, fd.get('newPassword')), 'Password reset')
  revalidatePath('/admin', 'layout')
  return r
}
```

- [ ] **Step 7: The page** `src/app/admin/staff/page.tsx`

Server component. First line of the body: `const admin = await requireAdmin('staff.manage')`, then
`const staff = await listStaff(admin.id)`. Layout, reusing the existing components (look at
`src/app/admin/settings/page.tsx` and `src/app/admin/players/player-drawer.tsx` for their use):

- `PageHeader title="Staff"` containing an `ActionDialog` "Add manager" (title "Add a manager",
  description "They sign in with this username and password. Share it with them privately.",
  submitLabel "Add manager", `action={createManagerAction}`) with `Field`+`Input` for `username`
  (label "Username", `autoComplete="off"`) and `password` (label "Temporary password",
  `type="password"`, `autoComplete="new-password"`, `minLength={8}`).
- A `Card` with a `ul`, one `li` per row: username; role badge ("Superadmin" / "Manager");
  "Disabled" badge when `disabled`; "Last seen {formatDateTime(lastSeenAt)}" or "Never".
- For `role === 'MANAGER'` rows only (never superadmins, so never the viewer):
  - when active: `ActionForm` "Disable" with `action={disableStaffAction.bind(null, s.id)}`,
    `destructive`, `confirm={{ title: \`Disable ${s.username}?\`, description: 'They are signed
    out and cannot log in until enabled again.', actionLabel: 'Disable' }}`;
  - when disabled: `ActionForm` "Enable" with `enableStaffAction.bind(null, s.id)`;
  - `ActionDialog` "Reset password" (submitLabel "Reset password",
    `resetStaffPasswordAction.bind(null, s.id)`) with a `newPassword` field (label
    "New password", `type="password"`, `autoComplete="new-password"`, `minLength={8}`).
- Mobile: rows stack (`flex flex-col gap-2 sm:flex-row sm:items-center`); no horizontal scroll at
  390px. Use the `modern-web-guidance` skill for the row layout per CLAUDE.md.

Add `['admin/staff', () => import('@/app/admin/staff/page'), sp()]` to `adminPages` in
`tests/unit/admin-page-guards.test.ts`.

- [ ] **Step 8: E2E**

Move `signup`, `login` and `logout` from `e2e/full-flow.spec.ts` into `e2e/helpers.ts` (exported,
unchanged) and import them back in `full-flow.spec.ts`. Then `e2e/staff.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { confirmPhone } from '../src/server/admin/players'
import { registerPlayer } from '../src/server/users'
import { login, logout } from './helpers'

test('superadmin adds a manager; the manager grants points but cannot manage games or settings', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name
  const manager = `mgr_${tag}`
  const player = `pat_${tag}`
  const externalId = tag === 'desktop' ? 7101 : 7102
  const mobile = testInfo.project.use.isMobile === true

  const admin = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'admin' } })
  const pat = await registerPlayer({
    username: player,
    password: 'secret123',
    phone: tag === 'desktop' ? '0917 000 0201' : '0917 000 0202',
  })
  await confirmPhone(admin.id, pat.id)
  const game = await prisma.game.create({
    data: { externalId, startsAt: new Date(Date.now() + 3600_000), awayTeam: 'BOS', homeTeam: 'NYK', status: 'SCHEDULED' },
  })

  // superadmin adds the manager
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto('/admin/staff')
  await page.getByRole('button', { name: 'Add manager' }).click()
  await page.getByLabel('Username').fill(manager)
  await page.getByLabel('Temporary password').fill('managerpw1')
  await page.getByRole('dialog').getByRole('button', { name: 'Add manager' }).click()
  await expect(page.getByText('Manager added')).toBeVisible()
  await expect(page.getByText(manager, { exact: true })).toBeVisible()
  await logout(page, 'admin')

  // the manager signs in: no Settings or Staff, no Force sync, no Void
  await login(page, manager, 'managerpw1')
  await page.waitForURL('**/admin')
  if (mobile) await page.getByRole('button', { name: 'Open menu' }).click()
  const nav = page.getByRole('navigation', { name: 'Admin' }).filter({ visible: true })
  await expect(nav.getByRole('link', { name: 'Players' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0)
  if (mobile) await page.keyboard.press('Escape')

  await page.goto('/admin/settings')
  await page.waitForURL(/\/admin$/)
  await page.goto('/admin/staff')
  await page.waitForURL(/\/admin$/)

  await page.goto(`/admin/games?game=${game.id}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Void game' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Force sync' })).toHaveCount(0)

  // ...but grants points to a player
  await page.goto(`/admin/players?player=${pat.id}`)
  await page.getByRole('button', { name: 'Grant', exact: true }).click()
  await page.getByLabel('Amount').fill('250')
  await page.getByLabel('Note').fill('cash in')
  await page.getByRole('button', { name: 'Grant points', exact: true }).click()
  await expect(page.getByText(/^Points updated/)).toBeVisible()
  expect((await prisma.user.findUniqueOrThrow({ where: { id: pat.id } })).balance).toBeGreaterThanOrEqual(250)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
```

(Selectors follow `e2e/full-flow.spec.ts`; adjust only to match the real accessible names, never
to skip an assertion.)

- [ ] **Step 9: Run everything**

Run: `npm run check` then `npm run test:e2e`
Expected: both PASS (e2e: 4 tests — 2 specs × desktop/iphone).

- [ ] **Step 10: Commit**

```bash
git add src tests e2e
git commit -m "feat: staff page for superadmins to manage managers"
```

---

## Deploy notes (for the PR, not a task)

Deploy order on the live box: `npx prisma migrate deploy` (renames `ADMIN` → `SUPERADMIN`), then
`npm run build`, then `systemctl --user restart lastdigit`. Until the restart, the old build reads
the renamed role; do the three steps together.
