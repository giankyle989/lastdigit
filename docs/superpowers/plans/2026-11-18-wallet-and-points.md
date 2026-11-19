# Wallet and Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split each player's single balance into a cashable wallet and bet-only bonus points.
Bets spend points first; wins return the points stake to points and everything else to the
wallet; staff can cash in, cash out, give points and take points.

**Architecture:** Two integer columns on `User` (`walletBalance`, renamed from `balance`, and
`pointsBalance`). Every `Transaction` row is tagged with the `account` it changed, and every `Bet`
records `pointsStake`. `postEntry()` stays the only writer of either balance. Pure split rules
live in `src/lib/funding.ts`; bets, settlement, void, bonuses and staff adjustments call them.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6, Postgres 16, zod, Vitest
(integration tests on real Postgres), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-wallet-and-points-design.md`

## Global Constraints

- `User.walletBalance` and `User.pointsBalance` change only through `postEntry()` in
  `src/server/ledger.ts`.
- `src/server` must not import `next/*` (except `session.ts`). `src/lib` is pure: no `@/lib/db`
  or `@/server/*`. `src/components` must not import `@/lib/db` or `@/server/*`.
- Every page and exported server action calls `requireUser()` / `requireAdmin(...)` itself.
  Staff balance changes use `requireAdmin('points.adjust')`. Server functions keep
  `assertCan(prisma, adminId, 'points.adjust')` as their first statement.
- Validate external input with zod.
- Money changes run inside one transaction. Lock games before users. Lock several users in
  ascending id order with `lockUsers`.
- **The database in `.env` is the LIVE production database.** Never run `prisma migrate dev`,
  `migrate deploy`, `db push` or `migrate reset` without `.env.test` in force. The migration in
  this plan is written by hand. Tests apply it to `lastdigit_test` through
  `tests/global-setup.ts`. `npx prisma generate` is safe: it touches no database.
- **Commits:**
  - Conventional Commits, body lines ≤ 100 characters.
  - No `Co-Authored-By` naming Claude/Anthropic, no "Generated with Claude Code".
  - Never `--no-verify`, `-n` or `HUSKY=0`.
  - Never commit `.env`, `.superpowers/` or test artifacts.
- Every task ends with `npm run check` passing (format, lint, typecheck, unit and integration
  tests).
- **Copy, verbatim from the spec:**
  - "Not enough in the wallet", "Not enough points", "Not enough balance";
  - "Can be cashed out", "Bonus credit, for betting only";
  - "Cash in recorded", "Cash out recorded", "Points given", "Points taken";
  - funding line "Uses N points + N wallet".
- UI work (`src/app`, `src/components`): consult the `modern-web-guidance` skill first.

## Ruling against the spec

Spec §4 step 1 says to lock the player row before the games. Settlement and void lock the game
first and the users second, and bets today implicitly do the same. Locking user-then-game in bets
could deadlock against settlement. **This plan locks the games first, then the player row**, in
the same game → user order everywhere. The behaviour the spec cares about (two slips can't spend
the same points) is unchanged.

## Review Focus

1. **Negative balance at bet time.** A void can leave the wallet or points below zero. Expected:
   a bet never spends from a negative balance and counts it as 0. Pinned in Task 2.
2. **Repeat bet on one ending, funded differently each time, then refunded.** Expected: each
   part goes back to its own balance. Pinned in Task 3.
3. **Void of a bet settled before this change** (`pointsStake` 0, PAYOUT rows on WALLET).
   Expected: everything is reversed on the wallet. Pinned in Task 3.
4. **Cash out larger than the wallet while points could cover it.** Expected: refused with "Not
   enough in the wallet", nothing changes. Pinned in Task 4.
5. **Old bookmarked `?sort=balance` link on the players table.** Expected: falls back to the
   default sort, no error. Pinned in Task 5.

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/20261118000003_wallet_and_points/migration.sql` | `Account` enum, new columns | 1 |
| `src/server/ledger.ts` | `postEntry` per account | 1 |
| `tests/architecture/rules.ts`, `tests/architecture.test.ts` | ledger-only writes of both columns | 1 |
| `src/lib/funding.ts` (new) | `splitStake`, `splitReturn` | 2 |
| `src/server/bets.ts` | split funding | 2 |
| `src/server/settlement.ts` | split payout, refund, void | 3 |
| `src/lib/wallet.ts` | adjust kinds, labels, toast, account labels | 4, 5 |
| `src/server/admin/players.ts`, `src/server/bonuses.ts`, `src/server/audit.ts` | `adjustBalance`, bonuses to points | 4 |
| `src/app/admin/actions.ts`, `src/app/admin/players/player-drawer.tsx` | four staff actions | 4, 5 |
| `src/server/admin/tables/players.ts`, `tables/ledger.ts`, `overview.ts`, admin pages | admin displays | 5 |
| `src/server/queries/player.ts`, `(player)/layout.tsx`, `wallet/page.tsx`, header, slip, referral | player displays | 6 |
| `e2e/*`, `README.md`, `CLAUDE.md` | end-to-end, docs | 4, 6, 7 |

---

### Task 1: Schema, migration and per-account ledger (no behaviour change)

Everything still goes to the wallet after this task. It is the rename plus the new columns, so
every later task starts from a compiling, green tree.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261118000003_wallet_and_points/migration.sql`
- Modify: `src/server/ledger.ts`
- Modify (rename `balance` → `walletBalance`, add `account: 'WALLET'`):
  - `src/server/bets.ts`, `src/server/settlement.ts`, `src/server/bonuses.ts`,
    `src/server/admin/players.ts`;
  - `src/server/queries/player.ts`, `src/server/admin/overview.ts`,
    `src/server/admin/tables/players.ts`;
  - `src/app/(player)/layout.tsx`, `src/app/(player)/wallet/page.tsx`, `src/app/admin/page.tsx`,
    `src/app/admin/players/page.tsx`, `src/app/admin/players/player-drawer.tsx`.
- Modify: `tests/architecture/rules.ts`, `tests/architecture.test.ts`, `tests/helpers/db.ts`
- Modify: every test and e2e file that reads `.balance` (list in Step 6)
- Modify: `CLAUDE.md` (hard rule 1)

**Interfaces:**
- Produces:
  - `enum Account { WALLET POINTS }` (from `@prisma/client`);
  - `User.walletBalance: number`, `User.pointsBalance: number`;
  - `Transaction.account: Account`, `Bet.pointsStake: number`;
  - `LedgerEntry = { userId: string; account: Account; type: TransactionType; amount: number; gameId?: string; betId?: string; adminId?: string; note?: string }`;
  - `postEntry(tx, entry, { requireFunds? })` updates `entry.account`'s column. With
    `requireFunds` it throws `DomainError('INSUFFICIENT_BALANCE', 'Not enough in the wallet' | 'Not enough points')`;
  - test helper `fundUser(userId, amount, account: Account = 'WALLET')`.

- [ ] **Step 1: Schema**

In `prisma/schema.prisma` add the enum, after `enum TransactionType`:

```prisma
enum Account {
  WALLET
  POINTS
}
```

In `model User` replace `balance             Int               @default(0)` with:

```prisma
  /// Cashable: top-ups and winnings. Changes only via postEntry().
  walletBalance       Int               @default(0)
  /// Bonus credit, bet only. Changes only via postEntry().
  pointsBalance       Int               @default(0)
```

In `model Transaction`, after `type         TransactionType`:

```prisma
  /// Which balance this row changed; balanceAfter is that balance after it.
  account      Account         @default(WALLET)
```

In `model Bet`, after `stake        Int`:

```prisma
  /// Part of `stake` paid from points; the wallet paid stake - pointsStake.
  pointsStake  Int           @default(0)
```

Run `npx prisma generate` (touches no database).

- [ ] **Step 2: Hand-written migration**

Create `prisma/migrations/20261118000003_wallet_and_points/migration.sql`:

```sql
-- One balance becomes two: today's balance is the wallet; points start at 0.
CREATE TYPE "Account" AS ENUM ('WALLET', 'POINTS');
ALTER TABLE "User" RENAME COLUMN "balance" TO "walletBalance";
ALTER TABLE "User" ADD COLUMN "pointsBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "account" "Account" NOT NULL DEFAULT 'WALLET';
ALTER TABLE "Bet" ADD COLUMN "pointsStake" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Prove the migration keeps balances (test DB, rolled back)**

Run this **before any test run in this task**, while `lastdigit_test` is still at the admin-levels
migration. It inserts a user with a balance, applies the migration and reads it back, all inside
a transaction that is rolled back:

```bash
{ echo 'BEGIN;'
  echo "INSERT INTO \"User\" (id, username, \"usernameKey\", \"passwordHash\", \"referralCode\", balance) VALUES ('mig-check', 'migcheck', 'migcheck', 'x', 'MIGCHECK', 415);"
  cat prisma/migrations/20261118000003_wallet_and_points/migration.sql
  echo "SELECT \"walletBalance\", \"pointsBalance\" FROM \"User\" WHERE id = 'mig-check';"
  echo 'ROLLBACK;'
} | docker exec -i lastdigit-db-1 psql -U postgres -d lastdigit_test -v ON_ERROR_STOP=1
```

Expected: the SELECT prints `415 | 0`, then `ROLLBACK`. If `lastdigit_test` was already migrated
(error "column balance does not exist"), skip this step and note it in the report.

- [ ] **Step 4: Ledger per account**

Replace `src/server/ledger.ts` with:

```ts
import { type Account, Prisma, type TransactionType } from '@prisma/client'

import type { Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'

export type LedgerEntry = {
  userId: string
  /** Which balance the entry changes. */
  account: Account
  type: TransactionType
  amount: number
  gameId?: string
  betId?: string
  adminId?: string
  note?: string
}

const COLUMN = { WALLET: 'walletBalance', POINTS: 'pointsBalance' } as const satisfies Record<
  Account,
  string
>

const NOT_ENOUGH: Record<Account, string> = {
  WALLET: 'Not enough in the wallet',
  POINTS: 'Not enough points',
}

/**
 * The ONLY way to change User.walletBalance or User.pointsBalance. Must be called inside
 * prisma.$transaction. requireFunds: the update only applies if that balance stays >= 0.
 */
export async function postEntry(tx: Tx, entry: LedgerEntry, opts: { requireFunds?: boolean } = {}) {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    throw new DomainError('VALIDATION', 'Amount must be a non-zero whole number')
  }
  const column = COLUMN[entry.account]

  let balanceAfter: number
  if (opts.requireFunds) {
    // The column name comes from the fixed map above, never from input.
    const col = Prisma.raw(`"${column}"`)
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE "User" SET ${col} = ${col} + ${entry.amount}
      WHERE id = ${entry.userId} AND ${col} + ${entry.amount} >= 0
      RETURNING ${col} AS balance`
    const row = rows[0]
    if (!row) throw new DomainError('INSUFFICIENT_BALANCE', NOT_ENOUGH[entry.account])
    balanceAfter = row.balance
  } else {
    const updated = await tx.user.update({
      where: { id: entry.userId },
      data: { [column]: { increment: entry.amount } },
      select: { walletBalance: true, pointsBalance: true },
    })
    balanceAfter = updated[column]
  }

  return tx.transaction.create({ data: { ...entry, balanceAfter } })
}
```

Keep `lockUsers` exactly as it is below `postEntry`.

- [ ] **Step 5: Add `account: 'WALLET'` and rename reads in src**

Every `postEntry(` call in `src/server/bets.ts`, `settlement.ts`, `bonuses.ts` and
`admin/players.ts` gets `account: 'WALLET'` in its entry object. This is temporary: Tasks 2–4
change them.

Rename these reads to `walletBalance` (behaviour unchanged):
- `src/server/queries/player.ts`: `select: { walletBalance: true }` and
  `balance: user.walletBalance` (the `SlipStatus` type keeps `balance` until Task 6).
- `src/server/admin/overview.ts`: both `balance` filters and the select/orderBy become
  `walletBalance`.
- `src/server/admin/tables/players.ts`: the `balance` sort case returns
  `{ walletBalance: sort.dir }`, and the select has `walletBalance: true` (sort names change in
  Task 5).
- `src/app/(player)/layout.tsx`: `balance={user.walletBalance}` in both places.
- `src/app/(player)/wallet/page.tsx`: `value={user.walletBalance}`.
- `src/app/admin/page.tsx`: `u.walletBalance`.
- `src/app/admin/players/page.tsx`: `r.walletBalance` in the Balance cell.
- `src/app/admin/players/player-drawer.tsx`: `p.walletBalance` in the Balance cell.

Run `npx tsc --noEmit`. It must report nothing under `src/`.

- [ ] **Step 6: Tests, helpers and architecture rule**

`tests/helpers/db.ts`:
- `makeUser`: `walletBalance: 0` instead of `balance: 0`.
- Replace `fundUser` and `expectLedgerConsistent` with:

```ts
export async function fundUser(userId: string, amount: number, account: Account = 'WALLET') {
  await prisma.$transaction((tx) =>
    postEntry(tx, { userId, account, type: 'ADMIN_GRANT', amount, note: 'test funding' }),
  )
}

/** Each balance equals the sum of its own ledger rows. */
export async function expectLedgerConsistent() {
  const rows = await prisma.$queryRaw<
    { id: string; wallet: number; points: number; walletTotal: number; pointsTotal: number }[]
  >`
    SELECT u.id, u."walletBalance" AS wallet, u."pointsBalance" AS points,
           COALESCE(SUM(t.amount) FILTER (WHERE t.account = 'WALLET'), 0)::int AS "walletTotal",
           COALESCE(SUM(t.amount) FILTER (WHERE t.account = 'POINTS'), 0)::int AS "pointsTotal"
    FROM "User" u LEFT JOIN "Transaction" t ON t."userId" = u.id
    GROUP BY u.id`
  for (const r of rows) {
    expect(r.wallet, `user ${r.id} wallet`).toBe(r.walletTotal)
    expect(r.points, `user ${r.id} points`).toBe(r.pointsTotal)
  }
}
```

(`import type { Account, Prisma } from '@prisma/client'`.)

Rename `.balance` reads of a user to `.walletBalance` in:
- `tests/integration/bets.test.ts`, `ledger.test.ts`, `admin-players.test.ts`,
  `daily-bonus.test.ts`, `settlement.test.ts`, `place-bets.test.ts`, `users.test.ts`,
  `sync.test.ts`;
- `tests/integration/admin-overview.test.ts`: the expected row is
  `{ id: neg.id, username: 'neg', walletBalance: -50 }`;
- `e2e/full-flow.spec.ts`, `e2e/staff.spec.ts`.

Leave `.balanceAfter`, `s.balance` (`SlipStatus`) and `tests/unit/*` alone.

Every direct `postEntry(tx, { ... })` in a test gets `account: 'WALLET'`.

In `tests/integration/place-bets.test.ts`, the expected message `'LAL @ GSW 2-2: Insufficient balance'`
becomes `'LAL @ GSW 2-2: Not enough in the wallet'`.

Add to `tests/integration/ledger.test.ts`:

```ts
  it('keeps the wallet and points apart', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'POINTS', type: 'DAILY_BONUS', amount: 70 }),
    )
    const t = await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'WALLET', type: 'ADMIN_GRANT', amount: 30 }),
    )
    expect(t).toMatchObject({ account: 'WALLET', balanceAfter: 30 })
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect([after.walletBalance, after.pointsBalance]).toEqual([30, 70])
    await expectLedgerConsistent()
  })

  it('names the account that ran short', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'WALLET', type: 'ADMIN_GRANT', amount: 500 }),
    )
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { userId: u.id, account: 'POINTS', type: 'BET', amount: -1 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough points' })
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { userId: u.id, account: 'WALLET', type: 'BET', amount: -501 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet' })
  })
```

`tests/architecture/rules.ts`: the rule now guards both columns.

```ts
const BALANCE_KEY = /\b(walletBalance|pointsBalance)\s*:/
const RAW_SQL_BALANCE_WRITES = [
  /"(walletBalance|pointsBalance)"\s*=/,
  /\bSET\s+"?(walletBalance|pointsBalance)"?\s*=/i,
]
```

In `findBalanceWrites`, replace `/\bbalance\s*:/` with `BALANCE_KEY`. Update the doc comments
("`walletBalance:`/`pointsBalance:` key").

`tests/architecture.test.ts`:
- In the "detects" and "ignores" examples, replace `balance` with `walletBalance`.
- Add one `pointsBalance` write example, expected `[1]`:
  `prisma.user.update({ data: { pointsBalance: { increment: 1 } } })`.
- Add `expect(findBalanceWrites('UPDATE "User" SET "pointsBalance" = 1')).toEqual([1])`.
- Rename the invariant to `'only the ledger writes User.walletBalance and User.pointsBalance'`,
  with message `'balances must only change via postEntry() in src/server/ledger.ts'`.

- [ ] **Step 7: CLAUDE.md hard rule 1**

Change it to: ``1. `User.walletBalance` and `User.pointsBalance` change only through `postEntry()` (`src/server/ledger.ts`).``

- [ ] **Step 8: Run everything**

Run: `npm run check`
Expected: PASS. Global setup applies the new migration to `lastdigit_test`.

Then check that the schema and migrations agree. This is read-only and runs against the test DB:

```bash
npx prisma migrate diff --from-url "$(grep '^DATABASE_URL=' .env.test | cut -d= -f2- | tr -d '"')" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: "No difference detected." and exit 0.

- [ ] **Step 9: Commit**

```bash
git add prisma src tests e2e CLAUDE.md
git commit -m "feat(ledger): two balances, wallet and points, with per-account ledger rows"
```

---

### Task 2: Points-first bet funding

**Files:**
- Create: `src/lib/funding.ts`
- Test: `tests/unit/funding.test.ts`
- Modify: `src/server/bets.ts`
- Test: `tests/integration/place-bets.test.ts`, `tests/integration/bets.test.ts`

**Interfaces:**
- Consumes (Task 1):
  - `postEntry` with `account`;
  - `lockUsers(tx, ids)`;
  - `User.walletBalance` / `pointsBalance`;
  - `Bet.pointsStake`;
  - `fundUser(id, amount, account)`.
- Produces:
  - `type Funding = { points: number; wallet: number }`;
  - `splitStake(stake: number, pointsAvailable: number): Funding`;
  - `splitReturn(amount: number, pointsStake: number): Funding` (used by Task 3);
  - `placeBets` failing with `DomainError('INSUFFICIENT_BALANCE', 'Not enough balance', pickIndex)`.

- [ ] **Step 1: Failing unit tests**

`tests/unit/funding.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { splitReturn, splitStake } from '@/lib/funding'

describe('splitStake', () => {
  it('spends points first, then the wallet', () => {
    expect(splitStake(100, 0)).toEqual({ points: 0, wallet: 100 })
    expect(splitStake(100, 60)).toEqual({ points: 60, wallet: 40 })
    expect(splitStake(100, 500)).toEqual({ points: 100, wallet: 0 })
  })

  it('treats negative points as none', () => {
    expect(splitStake(100, -30)).toEqual({ points: 0, wallet: 100 })
  })
})

describe('splitReturn', () => {
  it('returns the points stake to points and the rest to the wallet', () => {
    expect(splitReturn(250, 60)).toEqual({ points: 60, wallet: 190 })
  })

  it('a refund of the stake goes back exactly as it was paid', () => {
    expect(splitReturn(100, 60)).toEqual({ points: 60, wallet: 40 })
  })

  it('a wallet-only bet returns everything to the wallet', () => {
    expect(splitReturn(180, 0)).toEqual({ points: 0, wallet: 180 })
  })

  it('never returns more points than the amount', () => {
    expect(splitReturn(50, 60)).toEqual({ points: 50, wallet: 0 })
  })
})
```

Run: `npx vitest run tests/unit/funding.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/funding"".

- [ ] **Step 2: Implement `src/lib/funding.ts`**

```ts
/** How an amount is split between the two balances. */
export type Funding = { points: number; wallet: number }

/** A stake is paid from points first, then the wallet; a negative balance counts as 0. */
export function splitStake(stake: number, pointsAvailable: number): Funding {
  const points = Math.min(stake, Math.max(0, pointsAvailable))
  return { points, wallet: stake - points }
}

/**
 * A payout or refund for a bet: the part of the stake points paid goes back to points, the rest
 * (the wallet stake plus any profit) to the wallet.
 */
export function splitReturn(amount: number, pointsStake: number): Funding {
  const points = Math.min(amount, Math.max(0, pointsStake))
  return { points, wallet: amount - points }
}
```

Run: `npx vitest run tests/unit/funding.test.ts`
Expected: PASS.

- [ ] **Step 3: Failing integration tests**

Add to `tests/integration/place-bets.test.ts` inside its `describe`. Reuse the file's existing
`makeGame` / `makeUser` / `fundUser` imports, and add `expectLedgerConsistent` if it is missing:

```ts
  async function balancesOf(id: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } })
    return { wallet: u.walletBalance, points: u.pointsBalance }
  }

  it('pays a stake from points first, then the wallet', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 60, 'POINTS')
    const [bet] = await placeBets(u.id, [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 100 }])
    expect(bet).toMatchObject({ stake: 100, pointsStake: 60 })
    expect(await balancesOf(u.id)).toEqual({ wallet: 460, points: 0 })
    const rows = await prisma.transaction.findMany({ where: { type: 'BET' }, orderBy: { account: 'asc' } })
    expect(rows.map((r) => [r.account, r.amount])).toEqual([
      ['WALLET', -40],
      ['POINTS', -60],
    ])
    await expectLedgerConsistent()
  })

  it('crosses from points to the wallet partway through a slip', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 150, 'POINTS')
    const bets = await placeBets(u.id, [
      { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
      { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      { gameId: g.id, awayDigit: 3, homeDigit: 3, stake: 100 },
    ])
    expect(bets.map((b) => b.pointsStake)).toEqual([100, 50, 0])
    expect(await balancesOf(u.id)).toEqual({ wallet: 350, points: 0 })
    await expectLedgerConsistent()
  })

  it('grows stake and pointsStake together on a repeat bet', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 500, 'WALLET')
    await fundUser(u.id, 30, 'POINTS')
    await placeBets(u.id, [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 20 }])
    const [bet] = await placeBets(u.id, [{ gameId: g.id, awayDigit: 4, homeDigit: 4, stake: 50 }])
    expect(bet).toMatchObject({ stake: 70, pointsStake: 30 })
  })

  it('refuses a slip larger than both balances together, placing nothing', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 100, 'WALLET')
    await fundUser(u.id, 50, 'POINTS')
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 51 },
      ]),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      pickIndex: 1,
      message: 'LAL @ GSW 2-2: Not enough balance',
    })
    expect(await prisma.bet.count()).toBe(0)
    expect(await balancesOf(u.id)).toEqual({ wallet: 100, points: 50 })
  })

  it('never spends from a negative balance', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 200, 'WALLET')
    await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, account: 'POINTS', type: 'REFUND', amount: -40 }),
    )
    const [bet] = await placeBets(u.id, [{ gameId: g.id, awayDigit: 5, homeDigit: 5, stake: 100 }])
    expect(bet?.pointsStake).toBe(0)
    expect(await balancesOf(u.id)).toEqual({ wallet: 100, points: -40 })
  })

  it('two slips sent at once cannot spend the same points twice', async () => {
    const u = await makeUser()
    const g = await makeGame()
    await fundUser(u.id, 100, 'POINTS')
    const results = await Promise.allSettled([
      placeBets(u.id, [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 80 }]),
      placeBets(u.id, [{ gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 80 }]),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balancesOf(u.id)).toEqual({ wallet: 0, points: 20 })
    await expectLedgerConsistent()
  })
```

Update the existing test `'rejects a slip whose total exceeds the balance, flagging the pick that ran out'`:
its expected message becomes `'LAL @ GSW 2-2: Not enough balance'`. In
`tests/integration/bets.test.ts`, any `'Insufficient balance'` / `'Not enough in the wallet'`
expectation from a bet becomes `'Not enough balance'`.

Import `postEntry` from `@/server/ledger` in the test file if it is not imported yet.

Run: `npx vitest run tests/integration/place-bets.test.ts tests/integration/bets.test.ts`
Expected: the new tests FAIL (`pointsStake` is 0 and the points stay unspent).

- [ ] **Step 4: Implement split funding in `src/server/bets.ts`**

Imports: add `import { splitStake } from '@/lib/funding'` and change the ledger import to
`import { lockUsers, postEntry } from './ledger'`.

Right after `const games = await lockGames(...)` and the `fail` helper, add:

```ts
      // Games first, then the player (the order settlement and void use), so concurrent
      // slips queue on the player row and can't spend the same points twice.
      await lockUsers(tx, [userId])
      const funds = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { walletBalance: true, pointsBalance: true },
      })
      let pointsLeft = Math.max(0, funds.pointsBalance)
      let walletLeft = Math.max(0, funds.walletBalance)
```

Replace the block from `const { gameId, awayDigit, homeDigit, stake } = pick` through the
`try { await postEntry(...) } catch ...` with:

```ts
        const { gameId, awayDigit, homeDigit, stake } = pick
        if (stake > pointsLeft + walletLeft) {
          throw fail(index, pick, new DomainError('INSUFFICIENT_BALANCE', 'Not enough balance'))
        }
        const paid = splitStake(stake, pointsLeft)
        const bet = await tx.bet.upsert({
          where: { userId_gameId_awayDigit_homeDigit: { userId, gameId, awayDigit, homeDigit } },
          create: { userId, gameId, awayDigit, homeDigit, stake, pointsStake: paid.points },
          update: { stake: { increment: stake }, pointsStake: { increment: paid.points } },
        })
        try {
          if (paid.points > 0) {
            await postEntry(
              tx,
              { userId, account: 'POINTS', type: 'BET', amount: -paid.points, gameId, betId: bet.id },
              { requireFunds: true },
            )
          }
          if (paid.wallet > 0) {
            await postEntry(
              tx,
              { userId, account: 'WALLET', type: 'BET', amount: -paid.wallet, gameId, betId: bet.id },
              { requireFunds: true },
            )
          }
        } catch (e) {
          throw e instanceof DomainError ? fail(index, pick, e) : e
        }
        pointsLeft -= paid.points
        walletLeft -= paid.wallet
```

Update the `placeBets` doc comment: add "Each stake is paid from points first, then the wallet
(wallet-and-points spec §4)."

- [ ] **Step 5: Run and pass**

Run: `npx vitest run tests/unit/funding.test.ts tests/integration/place-bets.test.ts tests/integration/bets.test.ts`
Expected: PASS.

Then run `npm run check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/funding.ts src/server/bets.ts tests
git commit -m "feat(bets): pay stakes from points first, then the wallet"
```

---

### Task 3: Settlement, refunds and void per balance

**Files:**
- Modify: `src/server/settlement.ts`
- Test: `tests/integration/settlement.test.ts`

**Interfaces:**
- Consumes:
  - `splitReturn(amount, pointsStake)` from `@/lib/funding`;
  - `postEntry` with `account`;
  - `Bet.pointsStake`.
- Produces: no new exports.

- [ ] **Step 1: Failing tests**

Add to `tests/integration/settlement.test.ts`. Use the file's existing helpers: `makeUser`,
`makeGame`, `fundUser`, `placeBet`, `settleGame`, `voidGame`, `expectLedgerConsistent`. To finish
a game, use the same pattern the file already uses: update it to
`status: 'FINAL', awayScore, homeScore`, then call `settleGame(g.id)`.

```ts
  async function balancesOf(id: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } })
    return { wallet: u.walletBalance, points: u.pointsBalance }
  }

  async function finish(gameId: string, awayScore: number, homeScore: number) {
    await prisma.game.update({ where: { id: gameId }, data: { status: 'FINAL', awayScore, homeScore } })
    return settleGame(gameId)
  }

  it('a mixed bet that wins: points stake back to points, the rest to the wallet', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const g = await makeGame()
    await fundUser(a.id, 40, 'WALLET')
    await fundUser(a.id, 60, 'POINTS')
    await fundUser(b.id, 900, 'WALLET')
    await placeBet(a.id, { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 100 }) // 60 pts + 40 wallet
    await placeBet(b.id, { gameId: g.id, awayDigit: 3, homeDigit: 3, stake: 900 })
    await finish(g.id, 101, 102) // ending 1-2: a wins 90% of 1000 = 900
    expect(await balancesOf(a.id)).toEqual({ wallet: 840, points: 60 })
    const payouts = await prisma.transaction.findMany({ where: { type: 'PAYOUT' }, orderBy: { account: 'asc' } })
    expect(payouts.map((t) => [t.account, t.amount])).toEqual([
      ['WALLET', 840],
      ['POINTS', 60],
    ])
    await expectLedgerConsistent()
  })

  it('a refunded pool returns each part to the balance that paid it', async () => {
    const a = await makeUser()
    const g = await makeGame()
    await fundUser(a.id, 40, 'WALLET')
    await fundUser(a.id, 60, 'POINTS')
    await placeBet(a.id, { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 100 })
    await finish(g.id, 101, 102) // solo pool → refund
    expect(await balancesOf(a.id)).toEqual({ wallet: 40, points: 60 })
    await expectLedgerConsistent()
  })

  it('a repeat bet funded differently each time is refunded part by part', async () => {
    const a = await makeUser()
    const g = await makeGame()
    await fundUser(a.id, 30, 'POINTS')
    await fundUser(a.id, 100, 'WALLET')
    await placeBet(a.id, { gameId: g.id, awayDigit: 7, homeDigit: 7, stake: 20 }) // 20 pts
    await placeBet(a.id, { gameId: g.id, awayDigit: 7, homeDigit: 7, stake: 50 }) // 10 pts + 40 wallet
    await finish(g.id, 100, 100) // nobody else bet: solo refund
    expect(await balancesOf(a.id)).toEqual({ wallet: 100, points: 30 })
  })

  it('void after a mixed win nets both balances back to before the game', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const a = await makeUser()
    const b = await makeUser()
    const g = await makeGame()
    await fundUser(a.id, 40, 'WALLET')
    await fundUser(a.id, 60, 'POINTS')
    await fundUser(b.id, 900, 'WALLET')
    await placeBet(a.id, { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 100 })
    await placeBet(b.id, { gameId: g.id, awayDigit: 3, homeDigit: 3, stake: 900 })
    await finish(g.id, 101, 102)
    await voidGame(admin.id, g.id, 'wrong score')
    expect(await balancesOf(a.id)).toEqual({ wallet: 40, points: 60 })
    expect(await balancesOf(b.id)).toEqual({ wallet: 900, points: 0 })
    await expectLedgerConsistent()
  })

  it('void of a wallet-only win (as settled before points existed) reverses on the wallet', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const a = await makeUser()
    const b = await makeUser()
    const g = await makeGame()
    await fundUser(a.id, 100, 'WALLET')
    await fundUser(b.id, 100, 'WALLET')
    await placeBet(a.id, { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 100 })
    await placeBet(b.id, { gameId: g.id, awayDigit: 3, homeDigit: 3, stake: 100 })
    await finish(g.id, 101, 102)
    await voidGame(admin.id, g.id, 'wrong score')
    expect(await balancesOf(a.id)).toEqual({ wallet: 100, points: 0 })
    const reversals = await prisma.transaction.findMany({ where: { note: 'Payout reversal' } })
    expect(reversals.map((t) => t.account)).toEqual(['WALLET'])
  })
```

If the file already defines `balancesOf` or `finish`, reuse those instead of redefining them.

Run: `npx vitest run tests/integration/settlement.test.ts`
Expected: the mixed-funding tests FAIL (everything lands in the wallet).

- [ ] **Step 2: Implement in `src/server/settlement.ts`**

Imports: add `import type { Tx } from '@/lib/db'` and `import { splitReturn } from '@/lib/funding'`.

Add above `settleGame`:

```ts
type ReturnEntry = { type: 'PAYOUT' | 'REFUND'; gameId: string; adminId?: string; note?: string }

/** Credits `amount` for a bet: its points stake back to points, the rest to the wallet. */
async function postReturn(
  tx: Tx,
  bet: { id: string; userId: string; pointsStake: number },
  amount: number,
  entry: ReturnEntry,
) {
  const { points, wallet } = splitReturn(amount, bet.pointsStake)
  if (points > 0) {
    await postEntry(tx, { ...entry, userId: bet.userId, betId: bet.id, account: 'POINTS', amount: points })
  }
  if (wallet > 0) {
    await postEntry(tx, { ...entry, userId: bet.userId, betId: bet.id, account: 'WALLET', amount: wallet })
  }
}
```

In `settleGame`:
- The refund loop's `postEntry(...)` becomes
  `await postReturn(tx, bet, bet.stake, { type: 'REFUND', gameId, note: REFUND_NOTES[reason] })`.
- The payout `postEntry(...)` becomes
  `await postReturn(tx, bet, payout, { type: 'PAYOUT', gameId })`.

In `voidGame`, replace the body of `for (const bet of bets) { ... }` with:

```ts
        if (bet.payout > 0) {
          // Reverse each payout row on the balance it went to.
          const paid = await tx.transaction.findMany({
            where: { betId: bet.id, type: 'PAYOUT' },
            select: { account: true, amount: true },
            orderBy: { id: 'asc' },
          })
          for (const p of paid) {
            await postEntry(tx, {
              userId: bet.userId,
              account: p.account,
              type: 'REFUND',
              amount: -p.amount,
              gameId,
              betId: bet.id,
              adminId,
              note: 'Payout reversal',
            })
          }
        }
        await postReturn(tx, bet, bet.stake, {
          type: 'REFUND',
          gameId,
          adminId,
          note: `Game voided: ${why}`,
        })
        await tx.bet.update({ where: { id: bet.id }, data: { result: 'REFUNDED', payout: 0 } })
```

No `account: 'WALLET'` placeholder from Task 1 should remain in this file.

- [ ] **Step 3: Run and pass**

Run: `npx vitest run tests/integration/settlement.test.ts tests/integration/sync.test.ts`
Expected: PASS, including the existing tests ("a reversal can leave a negative balance" still
passes: wallet only).

Then run `npm run check`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/settlement.ts tests/integration/settlement.test.ts
git commit -m "feat(settlement): return each part of a stake to the balance that paid it"
```

---

### Task 4: Staff cash in / cash out / give / take points; bonuses as points

**Files:**
- Modify: `src/lib/wallet.ts`
- Test: `tests/unit/wallet.test.ts` (create it if it does not exist)
- Modify: `src/server/admin/players.ts`, `src/server/bonuses.ts`, `src/server/audit.ts`
- Modify: `src/app/admin/actions.ts`, `src/app/admin/players/player-drawer.tsx`
- Test: `tests/integration/admin-players.test.ts`, `tests/integration/authz.test.ts`,
  `tests/integration/daily-bonus.test.ts`
- Modify: `e2e/full-flow.spec.ts`, `e2e/staff.spec.ts` (drawer buttons and renamed function)

**Interfaces:**
- Consumes: `postEntry` with `account`; `assertCan`.
- Produces:
  - in `src/lib/wallet.ts`:
    - `ADJUST_KINDS = ['CASH_IN', 'CASH_OUT', 'GIVE_POINTS', 'TAKE_POINTS'] as const`;
    - `type AdjustKind`;
    - `type AdjustResult = { kind: AdjustKind; welcomeBonus: number; referralBonus: number }`;
    - `adjustToast(r: AdjustResult): string`;
  - `adjustBalance(adminId: string, userId: string, input: unknown): Promise<AdjustResult>`,
    replacing `adjustPoints`;
  - `adjustBalanceAction(userId, _prev, fd)`, replacing `adjustPointsAction`;
  - audit actions `'CASH_IN'` and `'CASH_OUT'`.

- [ ] **Step 1: Failing unit test for the toast**

`tests/unit/wallet.test.ts` (add to the file if it exists):

```ts
import { describe, expect, it } from 'vitest'

import { adjustToast } from '@/lib/wallet'

describe('adjustToast', () => {
  it('names what happened', () => {
    expect(adjustToast({ kind: 'CASH_OUT', welcomeBonus: 0, referralBonus: 0 })).toBe('Cash out recorded')
    expect(adjustToast({ kind: 'GIVE_POINTS', welcomeBonus: 0, referralBonus: 0 })).toBe('Points given')
    expect(adjustToast({ kind: 'TAKE_POINTS', welcomeBonus: 0, referralBonus: 0 })).toBe('Points taken')
    expect(adjustToast({ kind: 'CASH_IN', welcomeBonus: 0, referralBonus: 0 })).toBe('Cash in recorded')
  })

  it('lists the bonuses a first cash in paid', () => {
    expect(adjustToast({ kind: 'CASH_IN', welcomeBonus: 1000, referralBonus: 200 })).toBe(
      'Cash in recorded (+1,000 welcome bonus points, +200 points to their referrer)',
    )
    expect(adjustToast({ kind: 'CASH_IN', welcomeBonus: 500, referralBonus: 0 })).toBe(
      'Cash in recorded (+500 welcome bonus points)',
    )
  })
})
```

Run: `npx vitest run tests/unit/wallet.test.ts`
Expected: FAIL, `adjustToast` is not exported.

- [ ] **Step 2: Implement in `src/lib/wallet.ts`**

Append:

```ts
export const ADJUST_KINDS = ['CASH_IN', 'CASH_OUT', 'GIVE_POINTS', 'TAKE_POINTS'] as const
export type AdjustKind = (typeof ADJUST_KINDS)[number]

export type AdjustResult = { kind: AdjustKind; welcomeBonus: number; referralBonus: number }

const ADJUST_DONE: Record<AdjustKind, string> = {
  CASH_IN: 'Cash in recorded',
  CASH_OUT: 'Cash out recorded',
  GIVE_POINTS: 'Points given',
  TAKE_POINTS: 'Points taken',
}

/** Success toast for a staff balance change, listing any bonuses a first cash in paid. */
export function adjustToast({ kind, welcomeBonus, referralBonus }: AdjustResult): string {
  const extras = [
    welcomeBonus > 0 && `+${welcomeBonus.toLocaleString('en-US')} welcome bonus points`,
    referralBonus > 0 && `+${referralBonus.toLocaleString('en-US')} points to their referrer`,
  ].filter(Boolean)
  return extras.length ? `${ADJUST_DONE[kind]} (${extras.join(', ')})` : ADJUST_DONE[kind]
}
```

Run: `npx vitest run tests/unit/wallet.test.ts`
Expected: PASS.

- [ ] **Step 3: Failing integration tests**

In `tests/integration/admin-players.test.ts` and `tests/integration/authz.test.ts`:
- Rename the import `adjustPoints` → `adjustBalance`.
- Map every call's input: `{ direction: 'GRANT', ... }` → `{ kind: 'CASH_IN', ... }` and
  `{ direction: 'DEDUCT', ... }` → `{ kind: 'CASH_OUT', ... }`.
- Expected return values gain `kind`, e.g. `{ kind: 'CASH_IN', welcomeBonus: 300, referralBonus: 0 }`.
- Balance reads:
  - top-up and deduct amounts are read as `walletBalance`;
  - welcome and referral bonus amounts move to `pointsBalance`.
  - Rework each expected number accordingly. For example, `'matches the first top-up 1:1'`
    small: wallet 300 and points 300 (was balance 600).
  - Each test's comments say where the money is.
- The first test's audit lookup becomes `{ action: 'CASH_IN' }`.

Add to `tests/integration/admin-players.test.ts`:

```ts
  async function balancesOf(id: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } })
    return { wallet: u.walletBalance, points: u.pointsBalance }
  }

  it('gives and takes points without touching the wallet, auditing each', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    expect(await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 300, note: 'promo' })).toEqual({
      kind: 'GIVE_POINTS',
      welcomeBonus: 0,
      referralBonus: 0,
    })
    await adjustBalance(admin.id, p.id, { kind: 'TAKE_POINTS', amount: 100, note: 'fix' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 200 })
    const actions = await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['GRANT_POINTS', 'DEDUCT_POINTS'])
    await expectLedgerConsistent()
  })

  it('giving points never triggers the welcome or referral bonus', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    await setBonuses(admin.id, { welcomeBonusCap: 1000, referralPercent: 50, referralBonusCap: 500, dailyBonus: 0 })
    const ref = await makeUser()
    const p = await makeUser({ referredById: ref.id })
    await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 400, note: 'promo' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 400 })
    expect(await balancesOf(ref.id)).toEqual({ wallet: 0, points: 0 })
    // the later first cash in still pays both bonuses, as points
    expect(await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 300,
      referralBonus: 150,
    })
    expect(await balancesOf(p.id)).toEqual({ wallet: 300, points: 700 })
    expect(await balancesOf(ref.id)).toEqual({ wallet: 0, points: 150 })
  })

  it('cash out cannot dip into points', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 500, note: 'promo' })
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'CASH_OUT', amount: 1, note: 'payout' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 500 })
  })

  it('cannot take more points than the player has', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await adjustBalance(admin.id, p.id, { kind: 'GIVE_POINTS', amount: 50, note: 'promo' })
    await expect(
      adjustBalance(admin.id, p.id, { kind: 'TAKE_POINTS', amount: 51, note: 'fix' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough points' })
  })

  it('both grants need a confirmed phone; deductions do not', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser({ phoneConfirmedAt: null })
    for (const kind of ['CASH_IN', 'GIVE_POINTS'] as const) {
      await expect(adjustBalance(admin.id, p.id, { kind, amount: 10, note: 'x' })).rejects.toMatchObject({
        code: 'PHONE_NOT_CONFIRMED',
      })
    }
    await fundUser(p.id, 20, 'POINTS')
    await adjustBalance(admin.id, p.id, { kind: 'TAKE_POINTS', amount: 20, note: 'fix' })
    expect(await balancesOf(p.id)).toEqual({ wallet: 0, points: 0 })
  })

  it('a player with a grant from before the split gets no second welcome bonus', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    await setBonuses(admin.id, { welcomeBonusCap: 1000, referralPercent: 0, referralBonusCap: 0, dailyBonus: 0 })
    const p = await makeUser()
    await fundUser(p.id, 100, 'WALLET') // an old ADMIN_GRANT row, now on WALLET
    expect(await adjustBalance(admin.id, p.id, { kind: 'CASH_IN', amount: 300, note: 'top-up' })).toEqual({
      kind: 'CASH_IN',
      welcomeBonus: 0,
      referralBonus: 0,
    })
  })

  it('rejects an unknown kind', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const p = await makeUser()
    await expect(adjustBalance(admin.id, p.id, { kind: 'GRANT', amount: 10, note: 'x' })).rejects.toBeInstanceOf(
      ZodError,
    )
  })
```

(Import `fundUser` from `../helpers/db` if missing.)

In `tests/integration/daily-bonus.test.ts`, `balanceOf` reads `pointsBalance`. Add one assertion
that the DAILY_BONUS row has `account: 'POINTS'`.

Run: `npx vitest run tests/integration/admin-players.test.ts tests/integration/authz.test.ts tests/integration/daily-bonus.test.ts`
Expected: FAIL (`adjustBalance` is not exported).

- [ ] **Step 4: Implement the server side**

`src/server/audit.ts`: add `'CASH_IN'` and `'CASH_OUT'` to `ADMIN_ACTION_TYPES`, after
`'DEDUCT_POINTS'`.

`src/server/bonuses.ts`: the daily bonus entry gets `account: 'POINTS'`.

`src/server/admin/players.ts`:
- Imports: `import type { Account } from '@prisma/client'`,
  `import { ADJUST_KINDS, type AdjustKind, type AdjustResult } from '@/lib/wallet'`, and
  `import { type AdminActionType, logAdminAction } from '../audit'`. Check that `audit.ts`
  exports `AdminActionType`; it does.
- Replace `adjustSchema` and `adjustPoints` with:

```ts
const adjustSchema = z.object({
  kind: z.enum(ADJUST_KINDS, { errorMap: () => ({ message: 'Choose what to do' }) }),
  amount: intFromForm('Amount', 1, MAX_GRANT),
  note: z.string({ required_error: 'A note is required' }).trim().min(1, 'A note is required').max(500),
})

const KINDS: Record<AdjustKind, { account: Account; grant: boolean; audit: AdminActionType }> = {
  CASH_IN: { account: 'WALLET', grant: true, audit: 'CASH_IN' },
  CASH_OUT: { account: 'WALLET', grant: false, audit: 'CASH_OUT' },
  GIVE_POINTS: { account: 'POINTS', grant: true, audit: 'GRANT_POINTS' },
  TAKE_POINTS: { account: 'POINTS', grant: false, audit: 'DEDUCT_POINTS' },
}

/**
 * Cash in / cash out (wallet) or give / take points. Grants need a confirmed phone; deductions
 * can't take a balance below 0. A player's first cash in is their first top-up:
 * - it is matched 1:1 as a welcome bonus in points, up to `welcomeBonusCap`;
 * - if they were referred, the referrer gets `referralPercent`% of it in points, up to
 *   `referralBonusCap` (once per referred player, guarded by `referralBonusPaidAt`), but only if
 *   the referrer's phone is confirmed.
 */
export async function adjustBalance(adminId: string, userId: string, input: unknown): Promise<AdjustResult> {
  await assertCan(prisma, adminId, 'points.adjust')
  const { kind, amount, note } = adjustSchema.parse(input)
  const { account, grant, audit } = KINDS[kind]
  return prisma.$transaction(async (tx) => {
    const player = await requirePlayer(tx, userId)
    // Lock the player (and referrer) first so two concurrent first cash-ins can't both see
    // "no earlier cash in".
    await lockUsers(tx, player.referredById ? [userId, player.referredById] : [userId])
    if (grant) {
      const { phoneConfirmedAt } = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { phoneConfirmedAt: true },
      })
      if (!phoneConfirmedAt) throw new DomainError('PHONE_NOT_CONFIRMED', 'Confirm the phone number first')
    }
    const firstTopUp =
      kind === 'CASH_IN' &&
      (await tx.transaction.count({ where: { userId, type: 'ADMIN_GRANT', account: 'WALLET' } })) === 0
    await postEntry(
      tx,
      { userId, account, type: grant ? 'ADMIN_GRANT' : 'ADMIN_DEDUCT', amount: grant ? amount : -amount, adminId, note },
      { requireFunds: !grant },
    )
    await logAdminAction(tx, { adminId, action: audit, targetUserId: userId, details: { amount, note } })
    if (!firstTopUp) return { kind, welcomeBonus: 0, referralBonus: 0 }
```

The rest of the body (bonus lookup, welcome bonus, referral bonus) stays as it is today, with
two changes:
- each of the two bonus `postEntry` calls gets `account: 'POINTS'`;
- the final `return` becomes `return { kind, welcomeBonus, referralBonus }`.

`src/app/admin/actions.ts`: replace `adjustPointsAction` with:

```ts
export async function adjustBalanceAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin('points.adjust')
  const r = await runAction(
    () =>
      adjustBalance(admin.id, userId, {
        kind: fd.get('kind'),
        amount: fd.get('amount'),
        note: fd.get('note'),
      }),
    adjustToast,
  )
  revalidatePath('/admin', 'layout')
  return r
}
```

(Import `adjustBalance` instead of `adjustPoints`, and `adjustToast` from `@/lib/wallet`. Check
in `src/lib/action-state.ts` that `runAction`'s second argument accepts a function of the
result; the old action already passes one.)

- [ ] **Step 5: Drawer: four actions**

In `src/app/admin/players/player-drawer.tsx`, import `adjustBalanceAction` instead of
`adjustPointsAction`. Replace the two `ActionDialog`s "Grant" and "Deduct" with:

```tsx
        <ActionDialog
          triggerLabel="Cash in"
          disabled={!p.phoneConfirmedAt}
          title={`Cash in for ${p.username}`}
          description="Adds to the wallet. The first cash in pays the welcome and referral bonuses as points."
          submitLabel="Record cash in"
          action={adjustBalanceAction.bind(null, p.id)}
        >
          <input type="hidden" name="kind" value="CASH_IN" />
          <AmountAndNote />
        </ActionDialog>
        <ActionDialog
          triggerLabel="Cash out"
          title={`Cash out for ${p.username}`}
          description="Takes from the wallet only; points can't be cashed out."
          submitLabel="Record cash out"
          action={adjustBalanceAction.bind(null, p.id)}
        >
          <input type="hidden" name="kind" value="CASH_OUT" />
          <AmountAndNote />
        </ActionDialog>
        <ActionDialog
          triggerLabel="Give points"
          disabled={!p.phoneConfirmedAt}
          title={`Give points to ${p.username}`}
          description="Bonus points can only be bet."
          submitLabel="Add points"
          action={adjustBalanceAction.bind(null, p.id)}
        >
          <input type="hidden" name="kind" value="GIVE_POINTS" />
          <AmountAndNote />
        </ActionDialog>
        <ActionDialog
          triggerLabel="Take points"
          title={`Take points from ${p.username}`}
          submitLabel="Remove points"
          action={adjustBalanceAction.bind(null, p.id)}
        >
          <input type="hidden" name="kind" value="TAKE_POINTS" />
          <AmountAndNote />
        </ActionDialog>
```

and add at the bottom of the file:

```tsx
function AmountAndNote() {
  return (
    <>
      <Field id="amount" label="Amount">
        <Input id="amount" name="amount" type="number" min={1} step={1} required />
      </Field>
      <Field id="note" label="Note">
        <Input id="note" name="note" maxLength={500} required />
      </Field>
    </>
  )
}
```

The Edit number dialog's description becomes "Changing it means confirming it again before the
next cash in or points."

- [ ] **Step 6: E2E call sites (they compile under `tsc`)**

`e2e/full-flow.spec.ts`:
- Import `adjustBalance` instead of `adjustPoints`. Alice's top-up becomes
  `adjustBalance(adminRow.id, aliceRow.id, { kind: 'CASH_IN', amount: 100, note: 'top-up' })`.
- Every `getByRole('button', { name: 'Grant', exact: true })` → `{ name: 'Cash in', exact: true }`.
- The submit `{ name: 'Grant points', exact: true }` → `{ name: 'Record cash in', exact: true }`.
- The toast text becomes
  `'Cash in recorded (+1,000 welcome bonus points, +200 points to their referrer)'`.
- Alice's referral check reads `.pointsBalance` and stays `200`.
- Leave the final wallet-page and balance assertions for Task 6/7.

`e2e/staff.spec.ts`:
- The manager clicks `'Cash in'`, fills the amount, and submits `'Record cash in'`.
- The toast regex is `/^Cash in recorded/`.
- The check reads `.walletBalance` and expects `toBeGreaterThanOrEqual(250)`.

- [ ] **Step 7: Run and pass**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src tests e2e
git commit -m "feat(admin): cash in, cash out, give and take points; bonuses paid as points"
```

---

### Task 5: Admin displays: both balances, account column and filter

**Files:**
- Modify: `src/lib/wallet.ts` (account labels)
- Modify: `src/server/admin/tables/players.ts`, `src/app/admin/players/page.tsx`
- Modify: `src/app/admin/players/player-drawer.tsx` (balances, ledger tag)
- Modify: `src/server/admin/tables/ledger.ts`, `src/app/admin/ledger/page.tsx`
- Modify: `src/server/admin/overview.ts`, `src/app/admin/page.tsx`
- Test: `tests/integration/admin-tables.test.ts`, `tests/integration/admin-overview.test.ts`

**Interfaces:**
- Consumes: `Transaction.account`, `User.walletBalance` / `pointsBalance`.
- Produces:
  - `ACCOUNT_LABELS: Record<Account, string>` (`{ WALLET: 'Wallet', POINTS: 'Points' }`) in
    `src/lib/wallet.ts`, used by Task 6;
  - `PLAYER_SORTS = ['username', 'wallet', 'points', 'joined', 'referrals']`;
  - `LedgerListParams.account?: Account`;
  - `negativeBalances` rows `{ id, username, walletBalance, pointsBalance }`.

- [ ] **Step 1: Failing tests**

`tests/integration/admin-tables.test.ts`:
- Replace the `'-balance'` sort test with sorts by `'-wallet'` and `'-points'`. Fund two players
  differently with `fundUser(id, n, 'WALLET' | 'POINTS')` and assert the order.
- Add:

```ts
  it('an old ?sort=balance link falls back to the default sort', async () => {
    expect(parsePlayerListParams({ sort: 'balance' }).sort).toEqual({ field: 'joined', dir: 'desc' })
  })

  it('filters the ledger by account', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100, 'WALLET')
    await fundUser(u.id, 30, 'POINTS')
    const points = await listLedger(parseLedgerListParams({ account: 'POINTS' }))
    expect(points.rows.map((r) => r.account)).toEqual(['POINTS'])
    expect(points.totalAmount).toBe(30)
    expect(parseLedgerListParams({ account: 'CASH' }).account).toBeUndefined()
  })
```

(Import `listLedger`, `parseLedgerListParams` from `@/server/admin/tables/ledger` and `fundUser`
if they are missing.)

`tests/integration/admin-overview.test.ts`:
- The negative-balance expectation becomes
  `[{ id: neg.id, username: 'neg', walletBalance: -50, pointsBalance: 0 }]`.
- Add a case where a player has `pointsBalance` −20 (post
  `postEntry(tx, { userId, account: 'POINTS', type: 'REFUND', amount: -20 })`) and appears in
  `negativeBalances`. Also check that `getAdminBadges().needsAttention` is `true` for them.

Run: `npx vitest run tests/integration/admin-tables.test.ts tests/integration/admin-overview.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement queries**

`src/lib/wallet.ts`: add `import type { Account } from '@prisma/client'` (type-only) and

```ts
export const ACCOUNT_LABELS: Record<Account, string> = { WALLET: 'Wallet', POINTS: 'Points' }
```

`src/server/admin/tables/players.ts`:
- `PLAYER_SORTS = ['username', 'wallet', 'points', 'joined', 'referrals'] as const`.
- `orderBy`: `case 'wallet': return { walletBalance: sort.dir }` and
  `case 'points': return { pointsBalance: sort.dir }`, replacing the `balance` case.
- `select`: `walletBalance: true, pointsBalance: true`.

`src/server/admin/tables/ledger.ts`:
- Import `Account` as a value: `import { Account, type Prisma, TransactionType } from '@prisma/client'`.
- Add `export const LEDGER_ACCOUNTS = Object.values(Account)`.
- `LedgerListParams` gains `account?: Account`; the parse gains
  `account: parseOption(sp.account, LEDGER_ACCOUNTS)`.
- `where` gains `...(p.account ? { account: p.account } : {})`.

`src/server/admin/overview.ts`:
- The negative-balance `findMany`:

```ts
    prisma.user.findMany({
      where: { OR: [{ walletBalance: { lt: 0 } }, { pointsBalance: { lt: 0 } }] },
      select: { id: true, username: true, walletBalance: true, pointsBalance: true },
      orderBy: [{ walletBalance: 'asc' }, { pointsBalance: 'asc' }],
      take: ATTENTION_LIMIT,
    }),
```

- In `getAdminBadges`, the count uses the same `OR`.

- [ ] **Step 3: Implement pages**

`src/app/admin/players/page.tsx`: replace the Balance column with two columns:

```tsx
        {
          key: 'wallet',
          header: 'Wallet',
          sort: 'wallet',
          align: 'right',
          cell: (r) => <PointsAmount value={r.walletBalance} className={r.walletBalance < 0 ? 'text-danger' : ''} />,
        },
        {
          key: 'points',
          header: 'Points',
          sort: 'points',
          align: 'right',
          cell: (r) => <PointsAmount value={r.pointsBalance} className={r.pointsBalance < 0 ? 'text-danger' : ''} />,
        },
```

Keep whatever `align` the old Balance column used.

`src/app/admin/players/player-drawer.tsx`:
- Replace the single Balance `<div>` with two:

```tsx
        <div>
          <dt className="text-muted-foreground text-xs">Wallet</dt>
          <dd>
            <PointsAmount value={p.walletBalance} unit className={p.walletBalance < 0 ? 'text-danger' : ''} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Points</dt>
          <dd>
            <PointsAmount value={p.pointsBalance} unit className={p.pointsBalance < 0 ? 'text-danger' : ''} />
          </dd>
        </div>
```

- In the Ledger tab, the type line becomes
  `{TX_TYPE_LABELS[t.type]} · {ACCOUNT_LABELS[t.account]}` (import `ACCOUNT_LABELS`).

`src/app/admin/ledger/page.tsx`:
- Add a `SelectField` after Type:

```tsx
        <SelectField
          id="account"
          name="account"
          label="Account"
          defaultValue={params.account ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            ...LEDGER_ACCOUNTS.map((a) => ({ value: a, label: ACCOUNT_LABELS[a] })),
          ]}
        />
```

- Add a column after Type:
  `{ key: 'account', header: 'Account', cell: (t) => ACCOUNT_LABELS[t.account] }`.
- The footer's first `colSpan` goes from 3 to 4.
- Check how the existing Type filter drops `'all'` from the query (`parseOption` ignores
  unknown values); `account=all` parses to `undefined` the same way.

`src/app/admin/page.tsx`: the negative-balance item becomes:

```tsx
                {s.negativeBalances.map((u) => {
                  const which = [u.walletBalance < 0 && 'wallet', u.pointsBalance < 0 && 'points']
                    .filter(Boolean)
                    .join(' and ')
                  return (
                    <li key={u.id}>
                      <Link href={`/admin/players?player=${u.id}`} className="flex justify-between gap-2 py-2">
                        <span>
                          Negative {which}: {u.username}
                        </span>
                        <PointsAmount
                          value={Math.min(u.walletBalance, 0) + Math.min(u.pointsBalance, 0)}
                          className="text-danger"
                        />
                      </Link>
                    </li>
                  )
                })}
```

- [ ] **Step 4: Run and pass**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(admin): show wallet and points, ledger account column and filter"
```

---

### Task 6: Player displays: header total, two wallet cards, slip funding line

**Files:**
- Modify: `src/server/queries/player.ts`, `src/app/(player)/actions.ts` (doc comment only)
- Modify: `src/lib/slip.ts`
- Test: `tests/unit/slip.test.ts`, `tests/integration/player-feed.test.ts`
- Modify: `src/app/(player)/layout.tsx`, `src/components/shell/player-header.tsx`
- Modify: `src/components/bet-slip/slip-provider.tsx`, `src/components/bet-slip/bet-slip-panel.tsx`
- Modify: `src/app/(player)/wallet/page.tsx`, `src/app/(player)/more/referral/page.tsx`
- Modify: `e2e/full-flow.spec.ts` (final balance assertions)

**Interfaces:**
- Consumes:
  - `splitStake` from `@/lib/funding`;
  - `ACCOUNT_LABELS` from `@/lib/wallet`;
  - `Transaction.account`.
- Produces:
  - `SlipStatus = { walletBalance: number; pointsBalance: number; picks: PickStatus[] }`;
  - `fundingLine(total: number, points: number): string | null` in `src/lib/slip.ts`;
  - `SlipProvider` props `{ userId, balance, points, children }`, with `balance` the total;
    `useSlip().points`;
  - `PlayerHeader` props `{ wallet: number; points: number; isAdmin: boolean }`;
  - wallet page test ids `wallet-balance` and `points-balance`.

- [ ] **Step 1: Failing unit test**

Add to `tests/unit/slip.test.ts`:

```ts
describe('fundingLine', () => {
  it('says how a stake will be paid', () => {
    expect(fundingLine(0, 100)).toBeNull()
    expect(fundingLine(300, 0)).toBe('Uses 300 wallet')
    expect(fundingLine(300, 500)).toBe('Uses 300 points')
    expect(fundingLine(700, 500)).toBe('Uses 500 points + 200 wallet')
    expect(fundingLine(1500, 1200)).toBe('Uses 1,200 points + 300 wallet')
  })
})
```

(import `fundingLine` from `@/lib/slip`.)

Run: `npx vitest run tests/unit/slip.test.ts`
Expected: FAIL, `fundingLine` is not exported.

- [ ] **Step 2: Implement `fundingLine` in `src/lib/slip.ts`**

```ts
/** "Uses 500 points + 200 wallet": how a slip total will be paid, points first; null when empty. */
export function fundingLine(total: number, points: number): string | null {
  if (total <= 0) return null
  const paid = splitStake(total, points)
  const parts = [
    paid.points > 0 && `${formatPoints(paid.points)} points`,
    paid.wallet > 0 && `${formatPoints(paid.wallet)} wallet`,
  ].filter(Boolean)
  return `Uses ${parts.join(' + ')}`
}
```

Imports: `import { splitStake } from './funding'`. Also `import { formatPoints } from './format'`,
unless `slip.ts` already imports it. `formatPoints(1200)` must give `'1,200'`: check
`src/lib/format.ts`, and if it differs, use `n.toLocaleString('en-US')` instead.

Run: `npx vitest run tests/unit/slip.test.ts`
Expected: PASS.

- [ ] **Step 3: Slip status returns both balances**

`src/server/queries/player.ts`:
- `export type SlipStatus = { walletBalance: number; pointsBalance: number; picks: PickStatus[] }`.
- The user select is `{ walletBalance: true, pointsBalance: true }`.
- The return has `walletBalance: user.walletBalance, pointsBalance: user.pointsBalance` instead
  of `balance`.
- Update the doc comment.

`src/server/queries/player.ts` `listMyTransactions` needs no change (it returns full rows,
`account` included).

`tests/integration/player-feed.test.ts`:
- `expect(s.balance).toBe(500)` becomes
  `expect([s.walletBalance, s.pointsBalance]).toEqual([500, 0])`.
- Add `await fundUser(u.id, 70, 'POINTS')` before the call, and expect `[500, 70]`. Adjust to
  the test's existing funding line.

- [ ] **Step 4: Layout, header and slip**

UI work: consult `modern-web-guidance` for an accessible link label before editing.

`src/app/(player)/layout.tsx`:

```tsx
    <SlipProvider userId={user.id} balance={user.walletBalance + user.pointsBalance} points={user.pointsBalance}>
      <div className="min-h-dvh">
        <PlayerHeader wallet={user.walletBalance} points={user.pointsBalance} isAdmin={isStaff(user.role)} />
```

`src/components/shell/player-header.tsx`:

```tsx
export function PlayerHeader({ wallet, points, isAdmin }: { wallet: number; points: number; isAdmin: boolean }) {
  const total = wallet + points
```

The wallet link becomes:

```tsx
          <Link
            href="/wallet"
            aria-label={`Balance: ${formatPoints(total)} (wallet ${formatPoints(wallet)}, points ${formatPoints(points)})`}
            className="bg-surface-2 border-border hover:border-primary/60 rounded-full border px-3 py-1 text-sm"
          >
            <PointsAmount value={total} unit className="text-primary font-semibold" />
          </Link>
```

`src/components/bet-slip/slip-provider.tsx`:
- Add `points: number` to the context type (doc: "Points from the last server render; spent
  first."), to the provider props and to the memo value and its deps. Keep `balance` (now the
  total).

`src/components/bet-slip/bet-slip-panel.tsx`:
- `type SlipStatusView = { walletBalance: number; pointsBalance: number; picks: PickStatusView[] }`.
- Replace `const balance = status?.balance ?? slip.balance` with:

```tsx
  const balance = status ? status.walletBalance + status.pointsBalance : slip.balance
  const points = status?.pointsBalance ?? slip.points
```

- Rename the "Balance" `<dt>` to "Available".
- Add, after the `<dl>` and before the estimate `<p>`:

```tsx
      {fundingLine(total, points) && (
        <p className="text-muted-foreground text-xs" data-testid="slip-funding">
          {fundingLine(total, points)}
        </p>
      )}
```

(import `fundingLine` from `@/lib/slip`.) Bind it once:
`const funding = fundingLine(total, points)` next to `total`, and render `funding`.

`src/app/(player)/actions.ts`: update the `getSlipStatusAction` doc comment to "plus both
balances".

- [ ] **Step 5: Wallet page**

`src/app/(player)/wallet/page.tsx`: replace the single balance `<section>` with:

```tsx
      <div className="grid grid-cols-2 gap-3">
        <section className="from-primary/20 to-card border-border rounded-xl border bg-gradient-to-br p-4">
          <h2 className="text-muted-foreground text-sm">Wallet</h2>
          <div className="mt-1 text-3xl font-bold" data-testid="wallet-balance">
            <PointsAmount value={user.walletBalance} unit />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Can be cashed out</p>
        </section>
        <section className="bg-card border-border rounded-xl border p-4">
          <h2 className="text-muted-foreground text-sm">Points</h2>
          <div className="mt-1 text-3xl font-bold" data-testid="points-balance">
            <PointsAmount value={user.pointsBalance} unit />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Bonus credit, for betting only</p>
        </section>
      </div>
```

On phone width (360 px), `text-3xl` with a seven-digit value must not overflow. Check this with
`modern-web-guidance` or by trying it, and drop to `text-2xl sm:text-3xl` if needed.

In `TransactionDays`, the row's label `<div className="text-sm font-medium">` becomes:

```tsx
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {TX_TYPE_LABELS[t.type]}
                    <span className="bg-surface-2 text-muted-foreground rounded px-1.5 text-[11px] font-normal">
                      {ACCOUNT_LABELS[t.account]}
                    </span>
                  </div>
```

Import `ACCOUNT_LABELS` from `@/lib/wallet`. The `balanceAfter` shown is already that account's
balance.

`src/app/(player)/more/referral/page.tsx`: the referral bonus sentence says the bonus is paid as
points. Change only the words around the existing `PointsAmount` so it reads "Earn N% of your
friend's first top-up as bonus points, up to M pts, …", keeping the rest of the existing
sentence.

- [ ] **Step 6: E2E final balances (compile now, run in Task 7)**

`e2e/full-flow.spec.ts`, the end of the test:

```ts
  // bob: wallet 1000 top-up + 350 (payout 450 minus the 100 points stake on 9-6);
  // points 1000 welcome + 100 daily - 400 staked + 100 points stake back
  await page.goto('/wallet')
  await expect(page.getByTestId('wallet-balance')).toHaveText('1,350 pts')
  await expect(page.getByTestId('points-balance')).toHaveText('800 pts')
  await expect(page.getByText('Payout', { exact: true }).first()).toBeVisible()

  // alice: wallet 100 top-up; points 200 referral + 100 welcome - 100 stake (her bet lost)
  const aliceAfter = await prisma.user.findUniqueOrThrow({ where: { usernameKey: alice } })
  expect([aliceAfter.walletBalance, aliceAfter.pointsBalance]).toEqual([100, 200])
```

Also check the slip line before Confirm bets:
`await expect(slipText('Uses 400 points')).toBeVisible()` (bob has 1,100 points).

- [ ] **Step 7: Run and pass**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src tests e2e
git commit -m "feat(player): wallet and points cards, header total, slip funding line"
```

---

### Task 7: End-to-end wallet flow, README deploy steps, full verification

**Files:**
- Create: `e2e/wallet.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes:
  - test ids `wallet-balance`, `points-balance`, `slip-funding`;
  - drawer buttons "Give points" / "Add points" and "Take points" / "Remove points";
  - `adjustBalance`, `confirmPhone`;
  - the `e2e/helpers.ts` `signup`, `login`, `logout`.

- [ ] **Step 1: Write `e2e/wallet.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { adjustBalance, confirmPhone } from '../src/server/admin/players'
import { login, logout, signup } from './helpers'

test('staff give and take points; a bet spends points first, then the wallet', async ({ page }, testInfo) => {
  const tag = testInfo.project.name
  const carol = `carol_${tag}`
  const mobile = testInfo.project.use.isMobile === true
  const phone = tag === 'desktop' ? '0917 000 0201' : '0917 000 0301'
  const externalId = tag === 'desktop' ? 7101 : 7102

  await signup(page, carol, phone)
  await logout(page, 'player')

  // carol's first cash in (whatever welcome bonus is configured), then her points are emptied
  const admin = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'admin' } })
  const row = await prisma.user.findUniqueOrThrow({ where: { usernameKey: carol } })
  await confirmPhone(admin.id, row.id)
  await adjustBalance(admin.id, row.id, { kind: 'CASH_IN', amount: 200, note: 'top-up' })
  const afterCashIn = await prisma.user.findUniqueOrThrow({ where: { id: row.id } })
  if (afterCashIn.pointsBalance > 0) {
    await adjustBalance(admin.id, row.id, { kind: 'TAKE_POINTS', amount: afterCashIn.pointsBalance, note: 'reset' })
  }

  // staff give 50 points, then take 10, from the drawer
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto(`/admin/players?player=${row.id}`)
  await page.getByRole('button', { name: 'Give points', exact: true }).click()
  await page.getByLabel('Amount').fill('50')
  await page.getByLabel('Note').fill('promo')
  await page.getByRole('button', { name: 'Add points', exact: true }).click()
  await expect(page.getByText('Points given')).toBeVisible()
  await page.getByRole('button', { name: 'Take points', exact: true }).click()
  await page.getByLabel('Amount').fill('10')
  await page.getByLabel('Note').fill('correction')
  await page.getByRole('button', { name: 'Remove points', exact: true }).click()
  await expect(page.getByText('Points taken')).toBeVisible()
  const beforeBet = await prisma.user.findUniqueOrThrow({ where: { id: row.id } })
  expect([beforeBet.walletBalance, beforeBet.pointsBalance]).toEqual([200, 40])
  await logout(page, 'admin')

  // carol bets 100 on one ending: 40 points + 60 wallet
  const game = await prisma.game.create({
    data: {
      externalId,
      startsAt: new Date(Date.now() + 2 * 3600_000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    },
  })
  await login(page, carol, 'secret123')
  await page.waitForURL('**/games')
  await page.goto(`/games/${game.id}`)
  await page.getByRole('button', { name: 'LAL digit 1' }).click()
  await page.getByRole('button', { name: 'GSW digit 2' }).click()
  await page.getByRole('button', { name: 'Add to slip', exact: true }).click()
  if (mobile) await page.getByRole('button', { name: /^Open bet slip/ }).click()
  await expect(page.getByTestId('slip-funding').filter({ visible: true })).toHaveText('Uses 40 points + 60 wallet')
  await page.getByRole('button', { name: 'Confirm bets' }).click()
  await expect(page.getByText('Bet placed')).toBeVisible()

  await page.goto('/wallet')
  await expect(page.getByTestId('wallet-balance')).toHaveText('140 pts')
  await expect(page.getByTestId('points-balance')).toHaveText('0 pts')
  await expect(page.getByText('Bet', { exact: true })).toHaveCount(2)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
```

Before running, check two assumptions against the code and fix the spec if either is wrong:
- the slip's default stake is 100 (`DEFAULT_STAKE` in `src/lib/slip.ts`);
- the success toast for a single-pick slip reads "Bet placed" (see `placeBetsAction` in
  `src/app/(player)/actions.ts`; full-flow shows "4 bets placed" for four).

`signup`'s default password must be `secret123` (as full-flow uses). Check this in
`e2e/helpers.ts`.

- [ ] **Step 2: README**

Add an "Upgrading to wallet and points" section after "Upgrading to admin levels":

````markdown
### Upgrading to wallet and points

The migration renames `User.balance` to `walletBalance` (today's balances become wallet money) and
adds `pointsBalance`, `Transaction.account` and `Bet.pointsStake`.

1. Back up: `pg_dump` the database.
2. `npm run build`
3. `npx prisma migrate deploy`
4. `systemctl --user restart lastdigit`

Run steps 2–4 together: after the migration the old running build can't read `balance`.

**Rollback** (before anyone has points):

```sql
ALTER TABLE "User" DROP COLUMN "pointsBalance";
ALTER TABLE "User" RENAME COLUMN "walletBalance" TO "balance";
ALTER TABLE "Transaction" DROP COLUMN "account";
ALTER TABLE "Bet" DROP COLUMN "pointsStake";
DROP TYPE "Account";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118000003_wallet_and_points';
```

Then deploy the previous build. Once points have been used, first add each player's
`pointsBalance` into `walletBalance`.
````

- [ ] **Step 3: Full verification**

Run: `npm run check`
Expected: PASS.

Run: `npm run test:e2e`
Expected: every spec passes on desktop and iPhone (full-flow, staff, wallet).

- [ ] **Step 4: Commit**

```bash
git add e2e/wallet.spec.ts README.md
git commit -m "test(e2e): wallet and points flow; docs: upgrade steps"
```
