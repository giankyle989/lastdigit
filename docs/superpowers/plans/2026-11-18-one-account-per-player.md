# One Account Per Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every player account carries a unique PH mobile number that an admin confirms before
the first grant, and admins see accounts that share a device or network.

**Architecture:** A pure phone parser (`src/lib/phone.ts`) feeds signup and an admin phone
service; `adjustPoints` refuses a GRANT until the phone is confirmed. A custom Node server
(`server.mjs`) stamps the real client IP on each request; server actions read it plus a device
cookie and record hashed sightings (`AccountSighting`) that the admin drawer, players list and
overview query for links.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + Postgres, Auth.js credentials, zod, Vitest,
Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-one-account-per-player-design.md`

## Global Constraints

- Accepted phone input: `09XXXXXXXXX`, `9XXXXXXXXX`, `639XXXXXXXXX` or `+639XXXXXXXXX`; spaces
  and dashes ignored. Stored as `+639XXXXXXXXX`. Shown as `0917 123 4567`.
- Copy, verbatim: "Enter a PH mobile number, e.g. 0917 123 4567" · "This number is already
  registered." · "Confirm the phone number first" · "Add a phone number first".
- Audit actions: `UPDATE_PHONE` (details `{ from, to }`), `CONFIRM_PHONE` (details `{ phone }`).
- Device cookie `ld_device`: 16 random bytes, base64url (22 chars); `httpOnly`, `SameSite=Lax`,
  `Secure` only when `x-forwarded-proto` is `https`, `Path=/`, max-age 2 years.
- Client IP header `x-lastdigit-client-ip`, always overwritten by `server.mjs`; with
  `TRUSTED_PROXY=1` the right-most `x-forwarded-for` entry is used instead of the socket peer.
- Fingerprints: HMAC-SHA256 of `"<KIND>:<value>"` keyed by `AUTH_SECRET`, hex. Raw device IDs
  and IPs are never stored. An `'unknown'` IP is never recorded.
- Flags never block anyone. Admin accounts are never listed as linked or counted.
- CLAUDE.md hard rules apply: `requireAdmin()` in every admin action, zod for input, no
  `prisma migrate reset`, Conventional Commits with no AI attribution, never `--no-verify`.
- `src/server` must not import `next/*`; request helpers (headers, cookies) live in `src/app`.

## Review Focus

1. The same number typed two ways (`0917-123-4567` vs `+639171234567`) must be refused as a
   duplicate → Task 2 integration test "refuses the same number in another spelling".
2. Two signups racing with one number → exactly one succeeds → Task 2 integration test.
3. A client sending its own `x-lastdigit-client-ip` must not change the recorded IP → Task 4
   unit test "overwrites a client-sent header".
4. IPv4 peers arrive as `::ffff:192.168.1.5`; they must match plain `192.168.1.5` → Task 4 unit
   test "strips the IPv4-mapped prefix".
5. Re-saving the same number must not clear a confirmation → Task 3 integration test
   "saving the same number keeps the confirmation".

---

### Task 1: Phone number parsing

**Files:**

- Create: `src/lib/phone.ts`
- Test: `tests/unit/phone.test.ts`

**Interfaces:**

- Produces: `parsePhPhone(input: string): string | null`, `formatPhPhone(e164: string): string`,
  `phoneSchema` (zod string → normalised `+639…`), `PHONE_HINT` (string).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/phone.test.ts
import { describe, expect, it } from 'vitest'

import { formatPhPhone, parsePhPhone, PHONE_HINT, phoneSchema } from '@/lib/phone'

describe('parsePhPhone', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['0917 123 4567', '+639171234567'],
    ['0917-123-4567', '+639171234567'],
    [' +63 917 123 4567 ', '+639171234567'],
  ])('accepts %s', (input, expected) => {
    expect(parsePhPhone(input)).toBe(expected)
  })

  it.each([
    '',
    '0917123456', // too short
    '091712345678', // too long
    '08171234567', // not a mobile prefix
    '0281234567', // Manila landline
    '+6309171234567',
    '+19171234567',
    '0917a234567',
  ])('rejects %s', (input) => {
    expect(parsePhPhone(input)).toBeNull()
  })
})

describe('formatPhPhone', () => {
  it('shows the local form in groups', () => {
    expect(formatPhPhone('+639171234567')).toBe('0917 123 4567')
  })
})

describe('phoneSchema', () => {
  it('normalises valid input and explains invalid input', () => {
    expect(phoneSchema.parse('0917 123 4567')).toBe('+639171234567')
    const r = phoneSchema.safeParse('12345')
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(PHONE_HINT)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/phone.test.ts`
Expected: FAIL — cannot resolve `@/lib/phone`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/phone.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/phone.test.ts tests/architecture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts tests/unit/phone.test.ts
git commit -m "feat: parse and format PH mobile numbers"
```

---

### Task 2: Phone number at signup

**Files:**

- Modify: `prisma/schema.prisma` (User model) + new migration `phone_number`
- Modify: `src/lib/errors.ts` (codes), `src/server/users.ts` (`registerPlayer`)
- Modify: `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/actions.ts` (`signupAction`)
- Modify: `tests/helpers/db.ts` (`makeUser`, new `nextPhone`)
- Modify: every `registerPlayer(` call in `tests/integration/users.test.ts`,
  `tests/integration/settlement.test.ts`, `tests/integration/admin-players.test.ts`
- Modify: `e2e/full-flow.spec.ts` (`signup` helper)
- Test: `tests/integration/users.test.ts`

**Interfaces:**

- Consumes: `phoneSchema` from Task 1.
- Produces: `User.phone String? @unique`, `User.phoneConfirmedAt DateTime?`,
  `User.phoneConfirmedById String?` + relation `phoneConfirmedBy`; DomainError codes
  `PHONE_TAKEN`, `PHONE_NOT_CONFIRMED`; `registerPlayer({ username, password, phone,
referralCode? })`; test helper `nextPhone(): string` (a fresh `+639…` each call);
  `makeUser` defaults every user to a fresh phone **confirmed** now (override with
  `{ phone: null, phoneConfirmedAt: null }`).

- [ ] **Step 1: Schema and migration**

In `prisma/schema.prisma`, add to `model User` (after `lastDailyBonusOn`):

```prisma
  /// PH mobile number in E.164 (+639XXXXXXXXX); one account per number. Null for admins.
  phone               String?          @unique
  /// Set when an admin matched the number to a top-up payment; grants need it.
  phoneConfirmedAt    DateTime?
  phoneConfirmedById  String?
  phoneConfirmedBy    User?            @relation("PhoneConfirmations", fields: [phoneConfirmedById], references: [id])
  phoneConfirmations  User[]           @relation("PhoneConfirmations")
```

Run: `npx prisma migrate dev --name phone_number`
Expected: a new folder under `prisma/migrations/` adding three nullable columns, a unique index
on `phone` and a foreign key. Never run `migrate reset`.

- [ ] **Step 2: Error codes**

In `src/lib/errors.ts` add `| 'PHONE_TAKEN'` and `| 'PHONE_NOT_CONFIRMED'` to
`DomainErrorCode`.

- [ ] **Step 3: Test helpers**

In `tests/helpers/db.ts`, next to `makeUser`:

```ts
let phoneSeq = 0
/** A fresh, valid PH mobile number in E.164 for each call. */
export function nextPhone(): string {
  phoneSeq++
  return `+63917${String(phoneSeq).padStart(7, '0')}`
}
```

and make `makeUser` give every user a confirmed phone by default (before `...over`, so tests
can override with `null`):

```ts
      referralCode: `CODE${String(seq).padStart(4, '0')}`,
      phone: nextPhone(),
      phoneConfirmedAt: new Date(),
      ...over,
```

Then give every existing `registerPlayer({ ... })` call in the three integration test files a
`phone: nextPhone()` property (import `nextPhone` from `'../helpers/db'`).

- [ ] **Step 4: Write the failing tests**

Add to `tests/integration/users.test.ts` (inside its top-level `describe`, which already runs
`resetDb` before each test):

```ts
  it('stores the phone number in E.164', async () => {
    const u = await registerPlayer({ username: 'pia', password: 'secret123', phone: '0917 123 4567' })
    expect(u.phone).toBe('+639171234567')
    expect(u.phoneConfirmedAt).toBeNull()
  })

  it('requires a valid PH mobile number', async () => {
    await expect(registerPlayer({ username: 'pia', password: 'secret123' })).rejects.toBeInstanceOf(ZodError)
    await expect(
      registerPlayer({ username: 'pia', password: 'secret123', phone: '0281234567' }),
    ).rejects.toMatchObject({ issues: [{ message: 'Enter a PH mobile number, e.g. 0917 123 4567' }] })
    expect(await prisma.user.count()).toBe(0)
  })

  it('refuses the same number in another spelling', async () => {
    await registerPlayer({ username: 'pia', password: 'secret123', phone: '0917-123-4567' })
    await expect(
      registerPlayer({ username: 'quin', password: 'secret123', phone: '+639171234567' }),
    ).rejects.toMatchObject({ code: 'PHONE_TAKEN', message: 'This number is already registered.' })
  })

  it('lets only one of two racing signups take a number', async () => {
    const results = await Promise.allSettled([
      registerPlayer({ username: 'pia', password: 'secret123', phone: '09171234567' }),
      registerPlayer({ username: 'quin', password: 'secret123', phone: '09171234567' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'PHONE_TAKEN' },
    })
    expect(await prisma.user.count({ where: { phone: '+639171234567' } })).toBe(1)
  })
```

(Import `ZodError` from `'zod'` and `prisma` from `'@/lib/db'` if the file does not already.)

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run tests/integration/users.test.ts`
Expected: the four new tests FAIL (phone is ignored / not required).

- [ ] **Step 6: Implement `registerPlayer`**

In `src/server/users.ts`: import `{ phoneSchema } from '@/lib/phone'`; add `phone: phoneSchema,`
to `registerSchema`; destructure `phone` in `registerPlayer`; add `phone,` to the
`tx.user.create` data; and in the `catch`, before the `referralCode` check:

```ts
      if (isUniqueViolation(e, 'phone')) {
        throw new DomainError('PHONE_TAKEN', 'This number is already registered.')
      }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/integration`
Expected: PASS (all integration tests, including the updated `registerPlayer` callers).

- [ ] **Step 8: Signup form and action**

In `src/app/(auth)/signup/page.tsx`, between the Username and Password blocks:

```tsx
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0917 123 4567"
                required
              />
              <p className="text-muted-foreground text-xs">One account per number. Used to confirm top-ups.</p>
            </div>
```

In `src/app/(auth)/actions.ts` `signupAction`, pass the field through:

```ts
    registerPlayer({
      username,
      password,
      phone: String(fd.get('phone') ?? ''),
      referralCode: String(fd.get('referralCode') ?? ''),
    }),
```

- [ ] **Step 9: E2E signup helper**

In `e2e/full-flow.spec.ts`, give `signup` a phone parameter and fill it:

```ts
async function signup(page: Page, username: string, phone: string, ref?: string) {
  await page.goto(ref ? `/signup?ref=${ref}` : '/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL('**/games')
}
```

and in the test, after `const mobile = ...`, add distinct numbers per project:

```ts
  const phoneBase = tag === 'desktop' ? '0917 000 00' : '0917 000 01'
  const alicePhone = `${phoneBase}01`
  const bobPhone = `${phoneBase}02`
```

Update the two calls: `signup(page, alice, alicePhone)` and `signup(page, bob, bobPhone, code)`.

- [ ] **Step 10: Verify and commit**

Run: `npm run check`
Expected: PASS. (E2E is run at the end of Task 3, once grants can be confirmed.)

```bash
git add prisma src/lib/errors.ts src/server/users.ts "src/app/(auth)" tests e2e/full-flow.spec.ts
git commit -m "feat: require a unique PH mobile number at signup"
```

---

### Task 3: Admin confirms the phone before grants

**Files:**

- Modify: `src/server/audit.ts` (action types), `src/server/admin/players.ts`
- Modify: `src/server/admin/queries.ts` (`getPlayerDetail` includes `phoneConfirmedBy`)
- Modify: `src/app/admin/actions.ts`, `src/app/admin/players/player-drawer.tsx`
- Modify: `src/components/admin/action-dialog.tsx` (`disabled` prop)
- Modify: `e2e/full-flow.spec.ts`
- Test: `tests/integration/admin-players.test.ts`

**Interfaces:**

- Consumes: `phoneSchema`, `formatPhPhone` (Task 1); User phone columns, `PHONE_TAKEN`,
  `PHONE_NOT_CONFIRMED`, `makeUser`, `nextPhone` (Task 2).
- Produces: `setPhone(adminId: string, userId: string, phone: unknown): Promise<void>`,
  `confirmPhone(adminId: string, userId: string, now?: Date): Promise<void>`;
  actions `setPhoneAction(userId, _prev, fd)`, `confirmPhoneAction(userId)`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('admin player management')` of
`tests/integration/admin-players.test.ts` (import `confirmPhone`, `setPhone` from
`'@/server/admin/players'` and `nextPhone` from `'../helpers/db'`):

```ts
  it('blocks grants until the phone is confirmed, but always allows deductions', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ phone: '+639171111111', phoneConfirmedAt: null })
    await expect(
      adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'top-up' }),
    ).rejects.toMatchObject({ code: 'PHONE_NOT_CONFIRMED', message: 'Confirm the phone number first' })
    expect(await prisma.transaction.count()).toBe(0)

    await confirmPhone(admin.id, p.id)
    await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'top-up' })
    await setPhone(admin.id, p.id, '0917 222 2222') // clears the confirmation
    await adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 10, note: 'fix' })
    // 100 granted + 100 welcome match (default cap 1,000) − 10 deducted
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(190)
  })

  it('confirms the phone once and audits it', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ phone: '+639171111111', phoneConfirmedAt: null })
    const now = new Date('2026-11-18T03:00:00Z')
    await confirmPhone(admin.id, p.id, now)
    expect(await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      phoneConfirmedAt: now,
      phoneConfirmedById: admin.id,
    })
    expect(await prisma.adminAction.findFirstOrThrow({ where: { action: 'CONFIRM_PHONE' } })).toMatchObject({
      adminId: admin.id,
      targetUserId: p.id,
      details: { phone: '+639171111111' },
    })
  })

  it('cannot confirm a player without a number', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ phone: null, phoneConfirmedAt: null })
    await expect(confirmPhone(admin.id, p.id)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Add a phone number first',
    })
  })

  it('edits the number, clears the confirmation and audits old and new', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ phone: '+639171111111' })
    await setPhone(admin.id, p.id, '0917-222-2222')
    expect(await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      phone: '+639172222222',
      phoneConfirmedAt: null,
      phoneConfirmedById: null,
    })
    expect(await prisma.adminAction.findFirstOrThrow({ where: { action: 'UPDATE_PHONE' } })).toMatchObject({
      details: { from: '+639171111111', to: '+639172222222' },
    })
  })

  it('saving the same number keeps the confirmation', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ phone: '+639171111111' })
    await setPhone(admin.id, p.id, '09171111111')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).phoneConfirmedAt).not.toBeNull()
    expect(await prisma.adminAction.count({ where: { action: 'UPDATE_PHONE' } })).toBe(0)
  })

  it("refuses another player's number and invalid input", async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const taken = nextPhone()
    await makeUser({ phone: taken })
    const p = await makeUser()
    await expect(setPhone(admin.id, p.id, taken)).rejects.toMatchObject({ code: 'PHONE_TAKEN' })
    await expect(setPhone(admin.id, p.id, '12345')).rejects.toBeInstanceOf(ZodError)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/admin-players.test.ts`
Expected: FAIL — `setPhone`/`confirmPhone` are not exported.

- [ ] **Step 3: Audit action types**

In `src/server/audit.ts` add `'UPDATE_PHONE',` and `'CONFIRM_PHONE',` to `ADMIN_ACTION_TYPES`.

- [ ] **Step 4: Implement the service**

In `src/server/admin/players.ts`: import `{ Prisma } from '@prisma/client'` and
`{ phoneSchema } from '@/lib/phone'`. In `adjustPoints`, right after the `lockUsers(...)` call:

```ts
    if (grant) {
      const { phoneConfirmedAt } = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { phoneConfirmedAt: true },
      })
      if (!phoneConfirmedAt) throw new DomainError('PHONE_NOT_CONFIRMED', 'Confirm the phone number first')
    }
```

Then add:

```ts
/** Sets or changes a player's number (admin only). A new number must be confirmed again. */
export async function setPhone(adminId: string, userId: string, input: unknown): Promise<void> {
  const phone = phoneSchema.parse(input)
  try {
    await prisma.$transaction(async (tx) => {
      const player = await requirePlayer(tx, userId)
      if (player.phone === phone) return
      await tx.user.update({
        where: { id: userId },
        data: { phone, phoneConfirmedAt: null, phoneConfirmedById: null },
      })
      await logAdminAction(tx, {
        adminId,
        action: 'UPDATE_PHONE',
        targetUserId: userId,
        details: { from: player.phone, to: phone },
      })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError('PHONE_TAKEN', 'This number is already registered.')
    }
    throw e
  }
}

/** The admin matched the number to a top-up payment; grants are allowed from now on. */
export async function confirmPhone(adminId: string, userId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const player = await requirePlayer(tx, userId)
    if (!player.phone) throw new DomainError('VALIDATION', 'Add a phone number first')
    // Guard on the number we read, so a concurrent edit is not confirmed by mistake.
    const { count } = await tx.user.updateMany({
      where: { id: userId, phone: player.phone },
      data: { phoneConfirmedAt: now, phoneConfirmedById: adminId },
    })
    if (count === 0) throw new DomainError('CONFLICT', 'The number changed. Reload and try again.')
    await logAdminAction(tx, {
      adminId,
      action: 'CONFIRM_PHONE',
      targetUserId: userId,
      details: { phone: player.phone },
    })
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/integration`
Expected: PASS

- [ ] **Step 6: Server actions**

In `src/app/admin/actions.ts`, import `confirmPhone`, `setPhone` and add:

```ts
export async function setPhoneAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => setPhone(admin.id, userId, String(fd.get('phone') ?? '')), 'Number saved')
  revalidatePath('/admin', 'layout')
  return r
}

export async function confirmPhoneAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => confirmPhone(admin.id, userId), 'Phone confirmed')
  revalidatePath('/admin', 'layout')
  return r
}
```

- [ ] **Step 7: ActionDialog `disabled` prop**

In `src/components/admin/action-dialog.tsx` add `/** Disables the trigger button. */ disabled?:
boolean` to `Props`, destructure it, and pass `disabled={disabled}` to the trigger `<Button>`.

- [ ] **Step 8: Drawer UI**

In `src/server/admin/queries.ts` `getPlayerDetail`, add to `include`:
`phoneConfirmedBy: { select: { username: true } },`.

In `src/app/admin/players/player-drawer.tsx`: import `formatPhPhone` from `'@/lib/phone'` and
`confirmPhoneAction`, `setPhoneAction` from `'../actions'`. Add a Phone cell to the `<dl>` (first
cell, before Balance):

```tsx
        <div className="col-span-2">
          <dt className="text-muted-foreground text-xs">Phone</dt>
          <dd>
            {p.phone ? (
              <>
                <span className="num">{formatPhPhone(p.phone)}</span>{' '}
                {p.phoneConfirmedAt ? (
                  <span className="text-primary text-xs">
                    Confirmed {formatDate(p.phoneConfirmedAt)}
                    {p.phoneConfirmedBy ? ` by ${p.phoneConfirmedBy.username}` : ''}
                  </span>
                ) : (
                  <span className="text-live text-xs">Not confirmed</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">No number</span>
            )}
          </dd>
        </div>
```

At the start of the actions `<div className="flex flex-wrap gap-2">`, add:

```tsx
        {p.phone && !p.phoneConfirmedAt && (
          <ActionForm
            action={confirmPhoneAction.bind(null, p.id)}
            submitLabel="Confirm phone"
            className="contents"
          />
        )}
        <ActionDialog
          triggerLabel="Edit number"
          title={`Phone number for ${p.username}`}
          description="Changing it means confirming it again before the next grant."
          submitLabel="Save number"
          action={setPhoneAction.bind(null, p.id)}
        >
          <Field id="phone" label="Mobile number">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={p.phone ? formatPhPhone(p.phone) : ''}
              required
            />
          </Field>
        </ActionDialog>
```

Give the existing Grant `ActionDialog` `disabled={!p.phoneConfirmedAt}`, and after the actions
`<div>` closes add:

```tsx
      {!p.phoneConfirmedAt && <p className="text-muted-foreground text-xs">Confirm the phone number first</p>}
```

- [ ] **Step 9: E2E**

In `e2e/full-flow.spec.ts`:

1. Import `confirmPhone` alongside `adjustPoints` from `'../src/server/admin/players'`.
2. In the bob grant block, after the drawer dialog is visible and before clicking Grant:

```ts
  await expect(page.getByRole('button', { name: 'Grant', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Confirm phone' }).click()
  await expect(page.getByText('Phone confirmed')).toBeVisible()
```

3. Before `await adjustPoints(adminRow.id, aliceRow.id, ...)`, add
   `await confirmPhone(adminRow.id, aliceRow.id)`.

- [ ] **Step 10: Verify and commit**

Run: `npm run check` then `npm run test:e2e`
Expected: both PASS.

```bash
git add src e2e tests
git commit -m "feat: admins confirm a player's phone before the first grant"
```

---

### Task 4: Real client IP

**Files:**

- Create: `server.mjs`, `src/app/request-info.ts`
- Modify: `src/app/(auth)/actions.ts` (rate limit uses the new `clientIp`)
- Modify: `package.json` (`start`), `playwright.config.ts` (web server), `.env.example`
- Modify: `eslint.config.*` only if it rejects `server.mjs` (allow Node globals there)
- Test: `tests/unit/client-ip.test.ts`

**Interfaces:**

- Produces: from `server.mjs`: `CLIENT_IP_HEADER`, `clientIpFrom(req, trustProxy): string`,
  `stampClientIp(req, trustProxy): void`. From `src/app/request-info.ts`:
  `clientIp(): Promise<string>` (`'unknown'` when absent), `deviceId(): Promise<string | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/client-ip.test.ts
import { describe, expect, it } from 'vitest'

import { CLIENT_IP_HEADER, clientIpFrom, stampClientIp } from '../../server.mjs'

const req = (remoteAddress: string | undefined, headers: Record<string, string | string[]> = {}) => ({
  socket: { remoteAddress },
  headers: { ...headers },
})

describe('clientIpFrom', () => {
  it('uses the socket peer and ignores X-Forwarded-For by default', () => {
    expect(clientIpFrom(req('192.168.1.20', { 'x-forwarded-for': '6.6.6.6' }), false)).toBe('192.168.1.20')
  })

  it('strips the IPv4-mapped prefix', () => {
    expect(clientIpFrom(req('::ffff:192.168.1.20'), false)).toBe('192.168.1.20')
  })

  it('behind a trusted proxy, takes the right-most X-Forwarded-For entry', () => {
    expect(clientIpFrom(req('127.0.0.1', { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), true)).toBe(
      '203.0.113.9',
    )
  })

  it('falls back to the socket when a trusted proxy sent no header, then to unknown', () => {
    expect(clientIpFrom(req('127.0.0.1'), true)).toBe('127.0.0.1')
    expect(clientIpFrom(req(undefined), false)).toBe('unknown')
  })
})

describe('stampClientIp', () => {
  it('overwrites a client-sent header', () => {
    const r = req('192.168.1.20', { [CLIENT_IP_HEADER]: '1.2.3.4' })
    stampClientIp(r, false)
    expect(r.headers[CLIENT_IP_HEADER]).toBe('192.168.1.20')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/client-ip.test.ts`
Expected: FAIL — cannot find `server.mjs`.

- [ ] **Step 3: Write `server.mjs`**

```js
// server.mjs — production entry point. Wraps Next.js so every request carries the real client
// IP in CLIENT_IP_HEADER. Next.js only fills X-Forwarded-For when the client did not send one,
// so that header cannot be trusted for rate limits or account flags.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const CLIENT_IP_HEADER = 'x-lastdigit-client-ip'

/** The socket peer, or behind a trusted proxy the right-most X-Forwarded-For entry. */
export function clientIpFrom(req, trustProxy) {
  let ip
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for']
    const raw = Array.isArray(xff) ? xff.join(',') : (xff ?? '')
    ip = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1)
  }
  ip ??= req.socket.remoteAddress
  if (!ip) return 'unknown'
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
}

/** Replaces whatever the client sent in CLIENT_IP_HEADER with the real address. */
export function stampClientIp(req, trustProxy) {
  req.headers[CLIENT_IP_HEADER] = clientIpFrom(req, trustProxy)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: next } = await import('next')
  const port = Number(process.env.PORT ?? 3000)
  const hostname = process.env.HOST ?? '0.0.0.0'
  const trustProxy = process.env.TRUSTED_PROXY === '1'
  const app = next({ dev: false, hostname, port })
  const handle = app.getRequestHandler()
  await app.prepare()
  createServer((req, res) => {
    stampClientIp(req, trustProxy)
    void handle(req, res)
  }).listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/client-ip.test.ts`
Expected: PASS. If lint/typecheck reject importing `.mjs` from a test, add a
`server.d.mts` next to it:

```ts
// server.d.mts
import type { IncomingMessage } from 'node:http'
type Req = Pick<IncomingMessage, 'headers'> & { socket: { remoteAddress?: string } }
export const CLIENT_IP_HEADER: 'x-lastdigit-client-ip'
export function clientIpFrom(req: Req, trustProxy: boolean): string
export function stampClientIp(req: Req, trustProxy: boolean): void
```

- [ ] **Step 5: Request helpers in `src/app`**

```ts
// src/app/request-info.ts
import 'server-only'

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
```

If `server-only` is not installed, drop that import line (check `package.json` first).

- [ ] **Step 6: Use it for the signup rate limit**

In `src/app/(auth)/actions.ts`: delete the local `clientIp` function and the `headers` import,
and add `import { clientIp } from '../request-info'`. `signupAction` keeps
`const ip = await clientIp()`.

- [ ] **Step 7: Start scripts and docs**

- `package.json`: `"start": "node server.mjs"`.
- `playwright.config.ts` webServer: `command: 'npm run build && node server.mjs'`, and add
  `PORT: '3100'` and `HOST: '127.0.0.1'` to its `env`.
- `.env.example`, append:

```bash
# Production server (server.mjs). Set TRUSTED_PROXY=1 only behind a reverse proxy that sets
# X-Forwarded-For; otherwise the socket peer is the client IP.
HOST=0.0.0.0
PORT=3000
TRUSTED_PROXY=
```

- [ ] **Step 8: Verify the real server**

Run: `npm run build && PORT=3200 HOST=127.0.0.1 node server.mjs` in the background, then
`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3200/login`
Expected: `200`. Stop the server afterwards.

- [ ] **Step 9: Verify and commit**

Run: `npm run check` then `npm run test:e2e`
Expected: both PASS.

```bash
git add server.mjs src/app/request-info.ts "src/app/(auth)/actions.ts" package.json \
  playwright.config.ts .env.example tests/unit/client-ip.test.ts
git commit -m "fix: take the client IP from the socket, not a client header"
```

(Add `server.d.mts` / the ESLint config to `git add` if you created or changed them.)

**Deploy note for the controller (not the implementer):** `lastdigit.service` lives outside the
repo at `~/.config/systemd/user/lastdigit.service`. On deploy, change `ExecStart` to
`/home/kyle/.local/node/bin/node /home/kyle/lastdigit/server.mjs` with `Environment=HOST=0.0.0.0`
and `Environment=PORT=3000`, then `systemctl --user daemon-reload`.

---

### Task 5: Device and network flags

**Files:**

- Modify: `prisma/schema.prisma` + migration `account_sightings`
- Create: `src/server/sightings.ts`
- Modify: `src/app/(auth)/actions.ts` (record at signup and login)
- Modify: `src/server/admin/tables/players.ts`, `src/app/admin/players/page.tsx`,
  `src/app/admin/players/player-drawer.tsx`
- Modify: `src/server/admin/overview.ts`, `src/app/admin/page.tsx`
- Test: `tests/integration/sightings.test.ts`, `tests/integration/admin-overview.test.ts`

**Interfaces:**

- Consumes: `clientIp`, `deviceId` (Task 4); `makeUser` (Task 2).
- Produces: `recordSighting(userId: string, seen: { deviceId: string | null; ip: string },
now?: Date): Promise<void>`; `recordLoginSighting(username: string, seen): Promise<void>`;
  `linkedAccounts(userId: string): Promise<LinkedAccount[]>` with
  `LinkedAccount = { id: string; username: string; sameDevice: boolean; sameNetwork: boolean }`;
  `sharedDevicePlayerIds(): Promise<string[]>`; players list param `flag?: 'shared-device'`;
  overview field `sharedDevicePlayers: number`.

- [ ] **Step 1: Schema and migration**

In `prisma/schema.prisma`:

```prisma
enum SightingKind {
  DEVICE
  NETWORK
}

/// One account seen with one device or network. Values are HMAC fingerprints, never raw.
model AccountSighting {
  id          String       @id @default(cuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind        SightingKind
  fingerprint String
  firstSeenAt DateTime
  lastSeenAt  DateTime

  @@unique([userId, kind, fingerprint])
  @@index([kind, fingerprint])
}
```

and add `sightings AccountSighting[]` to `model User`. If `tests/helpers/truncate.ts` lists
tables explicitly, add `"AccountSighting"` to it.

Run: `npx prisma migrate dev --name account_sightings`

- [ ] **Step 2: Write the failing tests**

```ts
// tests/integration/sightings.test.ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import {
  linkedAccounts,
  recordLoginSighting,
  recordSighting,
  sharedDevicePlayerIds,
} from '@/server/sightings'

import { makeUser, resetDb } from '../helpers/db'

const DEVICE_A = 'AAAAAAAAAAAAAAAAAAAAAA'
const DEVICE_B = 'BBBBBBBBBBBBBBBBBBBBBB'

describe('account sightings', () => {
  beforeEach(resetDb)

  it('stores hashed fingerprints and updates lastSeenAt', async () => {
    const u = await makeUser()
    const t1 = new Date('2026-11-18T01:00:00Z')
    const t2 = new Date('2026-11-18T02:00:00Z')
    await recordSighting(u.id, { deviceId: DEVICE_A, ip: '192.168.1.20' }, t1)
    await recordSighting(u.id, { deviceId: DEVICE_A, ip: '192.168.1.20' }, t2)
    const rows = await prisma.accountSighting.findMany({ orderBy: { kind: 'asc' } })
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/)
      expect(r.fingerprint).not.toContain('192.168')
      expect(r).toMatchObject({ firstSeenAt: t1, lastSeenAt: t2 })
    }
  })

  it('skips an unknown IP and a missing device', async () => {
    const u = await makeUser()
    await recordSighting(u.id, { deviceId: null, ip: 'unknown' })
    expect(await prisma.accountSighting.count()).toBe(0)
  })

  it('links players by device and by network, never admins or the player itself', async () => {
    const pia = await makeUser({ username: 'pia' })
    const quin = await makeUser({ username: 'quin' })
    const rae = await makeUser({ username: 'rae' })
    const admin = await makeUser({ role: 'ADMIN' })
    await recordSighting(pia.id, { deviceId: DEVICE_A, ip: '10.0.0.1' })
    await recordSighting(quin.id, { deviceId: DEVICE_A, ip: '10.0.0.1' })
    await recordSighting(rae.id, { deviceId: DEVICE_B, ip: '10.0.0.1' })
    await recordSighting(admin.id, { deviceId: DEVICE_A, ip: '10.0.0.1' })

    expect(await linkedAccounts(pia.id)).toEqual([
      { id: quin.id, username: 'quin', sameDevice: true, sameNetwork: true },
      { id: rae.id, username: 'rae', sameDevice: false, sameNetwork: true },
    ])
    expect((await sharedDevicePlayerIds()).sort()).toEqual([pia.id, quin.id].sort())
  })

  it('records a login by username, case-insensitively', async () => {
    const u = await makeUser({ username: 'Pia' })
    await recordLoginSighting('pia', { deviceId: DEVICE_A, ip: '10.0.0.1' })
    expect(await prisma.accountSighting.count({ where: { userId: u.id } })).toBe(2)
    await recordLoginSighting('nobody', { deviceId: DEVICE_A, ip: '10.0.0.1' }) // no throw
  })
})
```

Add to `tests/integration/admin-overview.test.ts` (import `recordSighting`):

```ts
  it('counts players sharing a device, not players sharing only a network', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const c = await makeUser()
    await recordSighting(a.id, { deviceId: 'AAAAAAAAAAAAAAAAAAAAAA', ip: '10.0.0.1' })
    await recordSighting(b.id, { deviceId: 'AAAAAAAAAAAAAAAAAAAAAA', ip: '10.0.0.2' })
    await recordSighting(c.id, { deviceId: 'CCCCCCCCCCCCCCCCCCCCCC', ip: '10.0.0.1' })
    expect((await getOverviewStats()).sharedDevicePlayers).toBe(2)
    expect((await getAdminBadges()).needsAttention).toBe(true)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/integration/sightings.test.ts tests/integration/admin-overview.test.ts`
Expected: FAIL — `@/server/sightings` not found; `sharedDevicePlayers` undefined.

- [ ] **Step 4: Implement `src/server/sightings.ts`**

```ts
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
```

- [ ] **Step 5: Overview and badges**

In `src/server/admin/overview.ts`, import `sharedDevicePlayerIds` from `'../sightings'`. In
`getOverviewStats`, add `sharedDevice` as the last element of the `Promise.all` array
(`sharedDevicePlayerIds()`) and return `sharedDevicePlayers: sharedDevice.length`. In
`getAdminBadges`, add `sharedDevicePlayerIds()` to its `Promise.all` and include
`shared.length` in the `needsAttention` sum.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/integration`
Expected: PASS

- [ ] **Step 7: Record at signup and login**

In `src/app/(auth)/actions.ts`: import `{ isRedirectError } from
'next/dist/client/components/redirect-error'`, `{ clientIp, deviceId } from '../request-info'`
and `{ recordLoginSighting, recordSighting, type Seen } from '@/server/sightings'`. Add:

```ts
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
```

In `loginAction`, before `signIn`: `const seen = await seenNow()`, and in its `catch`, before
`throw e`:

```ts
    if (isRedirectError(e)) await safely(() => recordLoginSighting(String(fd.get('username') ?? ''), seen))
```

In `signupAction`, compute `const seen = await seenNow()` next to `ip`, capture the new user's
id from `registerPlayer`, and record it after `limiter.record(ip)`:

```ts
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
```

- [ ] **Step 8: Players list filter and badge**

In `src/server/admin/tables/players.ts`: add `export const PLAYER_FLAGS = ['shared-device'] as
const`, `flag?: (typeof PLAYER_FLAGS)[number]` on `PlayerListParams`,
`flag: parseOption(sp.flag, PLAYER_FLAGS)` in `parsePlayerListParams`, and in `listPlayers`:

```ts
  const sharedIds = p.flag === 'shared-device' ? await sharedDevicePlayerIds() : undefined
  const where: Prisma.UserWhereInput = {
    role: 'PLAYER',
    ...(sharedIds ? { id: { in: sharedIds } } : {}),
    // ...existing q and status filters unchanged
  }
```

(import `sharedDevicePlayerIds` from `'../../sightings'`).

In `src/app/admin/players/page.tsx`: add a `SelectField` to the `FilterForm`:

```tsx
        <SelectField
          id="flag"
          name="flag"
          label="Flags"
          defaultValue={params.flag ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            { value: 'shared-device', label: 'Shared device' },
          ]}
        />
```

In `PlayersTable`, fetch `const shared = new Set(await sharedDevicePlayerIds())` alongside
`listPlayers`, and render the username cell as:

```tsx
          cell: (r) => (
            <span className="flex items-center gap-2">
              {r.username}
              {shared.has(r.id) && (
                <span className="border-live text-live rounded border px-1 text-[10px] font-medium">
                  Shared device
                </span>
              )}
            </span>
          ),
```

- [ ] **Step 9: Drawer linked accounts**

Where `PlayerSheet` in `src/app/admin/players/page.tsx` loads `getPlayerDetail(id)`, also load
`linkedAccounts(id)` (in parallel) and pass it as `linked` to `PlayerDrawer`. In
`player-drawer.tsx`, accept `linked: LinkedAccount[]` and, after the `<dl>`, render:

```tsx
      {linked.length > 0 && (
        <section aria-labelledby="linked-heading" className="grid gap-1 text-sm">
          <h3 id="linked-heading" className="text-muted-foreground text-xs">
            Linked accounts
          </h3>
          <ul className="grid gap-1">
            {linked.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <Link href={`/admin/players?player=${l.id}`} className="text-primary hover:underline">
                  {l.username}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {[l.sameDevice && 'same device', l.sameNetwork && 'same network'].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 10: Needs attention item**

In `src/app/admin/page.tsx`, add `s.sharedDevicePlayers === 0 &&` to `allClear`, and a list item
after the negative balances:

```tsx
                {s.sharedDevicePlayers > 0 && (
                  <li>
                    <Link href="/admin/players?flag=shared-device" className="flex justify-between gap-2 py-2">
                      <span>
                        {s.sharedDevicePlayers} players share a device with another account
                      </span>
                      <span className="text-live">Review</span>
                    </Link>
                  </li>
                )}
```

- [ ] **Step 11: Verify and commit**

Run: `npm run check` then `npm run test:e2e`
Expected: both PASS.

```bash
git add prisma src tests
git commit -m "feat: flag accounts that share a device or network"
```
