# LastDigit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LastDigit, a free-to-play web game where players bet points on the last digit of each team's final NBA score, with a player site and an admin panel.

**Architecture:** One Next.js 15 App Router app (TypeScript). Domain logic lives in plain server modules under `src/server/` (no Next.js imports) so it can be tested with Vitest against a real Postgres test database. Pages are server components; mutations are server actions that call those modules. A cron-triggered route pulls games from balldontlie and auto-settles finished games.

**Tech Stack:** Next.js 15.5, React 19, TypeScript, Tailwind CSS v4, PostgreSQL 16 (Docker), Prisma 6.19, Auth.js (`next-auth@5.0.0-beta.32`, credentials provider), bcryptjs 3, zod 3, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-lastdigit-design.md` — read it before starting any task.

## Global Constraints

- Points have no monetary value; no payment, deposit or withdrawal code anywhere.
- Login is **username + password only**. No email, name or phone fields.
- Username: 3–20 chars, `[A-Za-z0-9_]`, trimmed, **case-insensitive unique** (stored as `username` for display + `usernameKey` = lowercase, unique).
- The word is **"bet"** everywhere (model `Bet`, ledger type `BET`, UI "Place bet", "My bets"). Never "guess".
- Ending = (away final score % 10, home final score % 10), overtime included, always written **away-home** (`9-6`), matchup shown as `AWAY @ HOME`.
- Payout: `payoutPool = floor(pool × 90 / 100)`; each winner gets `floor(payoutPool × stake / totalWinningStake)`; house keeps the rest. No winners → house keeps 100%. The 90% is a code constant.
- Betting closes when `now >= game.startsAt` (server time).
- `User.balance` changes only through `postEntry()` (Task 4), which writes a `Transaction` row in the same DB transaction.
- Referral bonus goes to the referrer only; default 500; admin-configurable.
- Restrictions: suspend (optional end date; null = indefinite) and per-game stake limit (total stake per game).
- Inquiry statuses: create → OPEN; admin reply → ANSWERED; player reply → OPEN; either side closes → CLOSED; CLOSED accepts no replies.
- Auth guards run in layouts **and** in every server action (`requireUser()` / `requireAdmin()`); Prisma cannot run in Edge middleware, so there is no `middleware.ts`.
- Pin `zod` to v3 (`^3.25.0`) and `prisma`/`@prisma/client` to `6.19.3`; the code uses v3/v6 APIs.
- Times are displayed in US Eastern with an "ET" suffix.
- JSX text must not contain raw `'` characters (Next lint rule `react/no-unescaped-entities` fails the build); reword or use `&apos;`.

## Review Focus

1. **Junk numeric form input** (`""`, `"10.5"`, `"-5"`, `"abc"`, `"0"`, `"1e3"` for stake/amount/digits) → rejected with a readable validation message, never coerced to 0 or a surprise value. Test owner: Task 6 (`placeBet` junk inputs).
2. **Username/referral-code casing and whitespace** (`" Kyle "` after `"kyle"` exists; referral `" abcd2345 "`) → duplicate username rejected; referral code accepted. Test owner: Task 5.
3. **API reports a game `Final` with missing/zero scores** → game is not marked FINAL and nothing is settled. Test owner: Task 8 (`mapApiGame` + `syncGames`).
4. **Game rescheduled after bets were placed** (API returns a new tip-off time) → `startsAt` updates while SCHEDULED/POSTPONED, existing bets untouched. Test owner: Task 8.
5. **A player opening or replying to another player's inquiry by id** → "Inquiry not found", no data leaked. Test owner: Task 10.

---

## File Structure

```
lastdigit/
  docker-compose.yml               Postgres 16 on port 5433 (dev + test DBs)
  docker/init.sql                  creates lastdigit_test DB
  .env / .env.test / .env.example  env vars
  vitest.config.ts                 loads .env.test, alias @ → src
  playwright.config.ts             E2E against `next start -p 3100`
  prisma/schema.prisma             data model
  prisma/seed.ts                   first admin + default settings
  src/
    lib/
      db.ts                        Prisma singleton + Tx type
      errors.ts                    DomainError + codes
      validation.ts                intFromForm() zod helper
      action-state.ts              ActionState type + runAction()
      format.ts                    time/points formatting
      suspension.ts                isSuspended()
      game/ending.ts               endingOf(), formatEnding()
      game/payout.ts               computeSplit(), PAYOUT_PERCENT
    server/
      ledger.ts                    postEntry()
      passwords.ts                 hashPassword(), verifyPassword()
      referral-code.ts             generateReferralCode()
      settings.ts                  referral bonus + last sync time
      audit.ts                     logAdminAction()
      users.ts                     registerPlayer(), verifyCredentials()
      bets.ts                      placeBet()
      settlement.ts                settleGame(), voidGame()
      sync/balldontlie.ts          API types, mapApiGame(), createBalldontlieFetcher()
      sync/sync.ts                 syncDates(), syncGames(), defaultFetcher()
      admin/players.ts             adjustPoints(), suspend/unsuspend, stake limit, reset password
      admin/queries.ts             dashboard stats + admin list/detail queries
      inquiries.ts                 inquiry tickets
      queries/player.ts            player-side read queries
      session.ts                   getCurrentUser(), requireUser(), requireAdmin()
    auth.ts                        Auth.js config
    components/                    ActionForm, BetGrid, Countdown, InquiryThread, Nav
    app/                           routes (see Tasks 11–13)
  tests/
    global-setup.ts                migrate reset on test DB
    helpers/db.ts                  resetDb(), makeUser(), makeGame(), fundUser(), expectLedgerConsistent()
    unit/ integration/             Vitest suites
  e2e/                             Playwright
```

---

### Task 1: Project scaffold, Postgres, Vitest

**Files:**
- Create (generator): Next.js app files in `/home/kyle/lastdigit`
- Create: `docker-compose.yml`, `docker/init.sql`, `.env`, `.env.test`, `.env.example`, `vitest.config.ts`, `tests/unit/smoke.test.ts`
- Modify: `.gitignore`, `package.json` (scripts)

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` (Vitest), `npm run db:up`, path alias `@/` → `src/`, env vars `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `BALLDONTLIE_API_KEY`, `CRON_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`

- [ ] **Step 1: Generate the Next.js app**

The folder already holds `docs/` and `.git/`, which create-next-app accepts.

```bash
cd /home/kyle/lastdigit
npx create-next-app@15.5.29 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack
```
Expected: "Success! Created lastdigit". If prompted about anything else, accept defaults.

- [ ] **Step 2: Install dependencies**

```bash
npm i @prisma/client@6.19.3 next-auth@5.0.0-beta.32 bcryptjs@^3.0.2 zod@^3.25.0
npm i -D prisma@6.19.3 vitest@^3.2.4 dotenv@^16.4.7 tsx@^4.19.0 @playwright/test@^1.55.0
```

- [ ] **Step 3: Postgres via Docker**

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: lastdigit
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
volumes:
  pgdata:
```

`docker/init.sql`:
```sql
CREATE DATABASE lastdigit_test;
```

Run: `docker compose up -d && sleep 3 && docker compose exec db psql -U postgres -c '\l' | grep lastdigit`
Expected: both `lastdigit` and `lastdigit_test` listed.

- [ ] **Step 4: Env files**

`.env`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/lastdigit"
AUTH_SECRET="dev-secret-change-me-0123456789abcdef0123456789"
AUTH_TRUST_HOST=true
BALLDONTLIE_API_KEY=""
CRON_SECRET="dev-cron-secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin12345"
```

`.env.test` (same keys, test DB):
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/lastdigit_test"
AUTH_SECRET="test-secret-0123456789abcdef0123456789abcdef"
AUTH_TRUST_HOST=true
BALLDONTLIE_API_KEY="unused-in-tests"
CRON_SECRET="test-cron-secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin12345"
```

`.env.example`: copy of `.env` with `AUTH_SECRET=""`, `CRON_SECRET=""`, `ADMIN_PASSWORD=""`.

Append to `.gitignore` (the generated file ignores `.env*`):
```
!.env.example
!.env.test
```

- [ ] **Step 5: Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
```

Add scripts to `package.json` `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"db:up": "docker compose up -d",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed"
```

- [ ] **Step 6: Smoke test**

`tests/unit/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('loads the test env', () => {
    expect(process.env.DATABASE_URL).toContain('lastdigit_test')
  })
})
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Build check and commit**

Run: `npm run build`
Expected: build succeeds.

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Postgres and Vitest"
```

---

### Task 2: Prisma schema, migration, test DB helpers

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `tests/global-setup.ts`, `tests/helpers/db.ts`, `tests/integration/db.test.ts`
- Modify: `vitest.config.ts` (add globalSetup)

**Interfaces:**
- Consumes: Task 1 env + Docker DB
- Produces:
  - `prisma` (PrismaClient singleton) and `type Tx = Prisma.TransactionClient` from `@/lib/db`
  - Enums from `@prisma/client`: `Role`, `UserStatus`, `GameStatus`, `BetResult`, `TransactionType`, `InquiryStatus`
  - Test helpers from `tests/helpers/db.ts`: `resetDb(): Promise<void>`, `makeUser(over?): Promise<User>`, `makeGame(over?): Promise<Game>`

- [ ] **Step 1: Write the schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  PLAYER
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum GameStatus {
  SCHEDULED
  LIVE
  FINAL
  SETTLED
  VOID
  POSTPONED
}

enum BetResult {
  PENDING
  WON
  LOST
  REFUNDED
}

enum TransactionType {
  REFERRAL_BONUS
  ADMIN_GRANT
  ADMIN_DEDUCT
  BET
  PAYOUT
  REFUND
}

enum InquiryStatus {
  OPEN
  ANSWERED
  CLOSED
}

model User {
  id                String           @id @default(cuid())
  username          String
  usernameKey       String           @unique
  passwordHash      String
  role              Role             @default(PLAYER)
  status            UserStatus       @default(ACTIVE)
  suspendedUntil    DateTime?
  stakeLimitPerGame Int?
  balance           Int              @default(0)
  referralCode      String           @unique
  referredById      String?
  referredBy        User?            @relation("Referrals", fields: [referredById], references: [id])
  referrals         User[]           @relation("Referrals")
  bets              Bet[]
  transactions      Transaction[]    @relation("UserTransactions")
  adminTransactions Transaction[]    @relation("AdminTransactions")
  inquiries         Inquiry[]
  inquiryMessages   InquiryMessage[]
  adminActions      AdminAction[]    @relation("ActionsByAdmin")
  targetedActions   AdminAction[]    @relation("ActionsOnUser")
  createdAt         DateTime         @default(now())
}

model Game {
  id           String        @id @default(cuid())
  externalId   Int           @unique
  startsAt     DateTime
  awayTeam     String
  homeTeam     String
  awayScore    Int?
  homeScore    Int?
  status       GameStatus    @default(SCHEDULED)
  pool         Int           @default(0)
  houseTake    Int           @default(0)
  settledAt    DateTime?
  voidReason   String?
  bets         Bet[]
  transactions Transaction[]
  adminActions AdminAction[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([startsAt])
  @@index([status])
}

model Bet {
  id           String        @id @default(cuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id])
  gameId       String
  game         Game          @relation(fields: [gameId], references: [id])
  awayDigit    Int
  homeDigit    Int
  stake        Int
  payout       Int           @default(0)
  result       BetResult     @default(PENDING)
  transactions Transaction[]
  createdAt    DateTime      @default(now())

  @@unique([userId, gameId, awayDigit, homeDigit])
  @@index([gameId])
}

model Transaction {
  id           String          @id @default(cuid())
  userId       String
  user         User            @relation("UserTransactions", fields: [userId], references: [id])
  type         TransactionType
  amount       Int
  balanceAfter Int
  gameId       String?
  game         Game?           @relation(fields: [gameId], references: [id])
  betId        String?
  bet          Bet?            @relation(fields: [betId], references: [id])
  adminId      String?
  admin        User?           @relation("AdminTransactions", fields: [adminId], references: [id])
  note         String?
  createdAt    DateTime        @default(now())

  @@index([userId, createdAt])
  @@index([type])
}

model Inquiry {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id])
  subject   String
  status    InquiryStatus    @default(OPEN)
  messages  InquiryMessage[]
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  @@index([status])
}

model InquiryMessage {
  id        String   @id @default(cuid())
  inquiryId String
  inquiry   Inquiry  @relation(fields: [inquiryId], references: [id])
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  body      String
  createdAt DateTime @default(now())
}

model AdminAction {
  id           String   @id @default(cuid())
  adminId      String
  admin        User     @relation("ActionsByAdmin", fields: [adminId], references: [id])
  action       String
  targetUserId String?
  targetUser   User?    @relation("ActionsOnUser", fields: [targetUserId], references: [id])
  targetGameId String?
  targetGame   Game?    @relation(fields: [targetGameId], references: [id])
  details      Json     @default("{}")
  createdAt    DateTime @default(now())
}

model Setting {
  key   String @id
  value String
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name init`
Expected: migration created under `prisma/migrations/`, client generated.

- [ ] **Step 3: Prisma singleton**

`src/lib/db.ts`:
```ts
import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export type Tx = Prisma.TransactionClient
```

- [ ] **Step 4: Test global setup and helpers**

`tests/global-setup.ts`:
```ts
import { execSync } from 'node:child_process'

export default function setup() {
  execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit', env: process.env })
}
```

Add to `vitest.config.ts` inside `test: {}`: `globalSetup: ['tests/global-setup.ts'],`

`tests/helpers/db.ts`:
```ts
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "InquiryMessage", "Inquiry", "AdminAction", "Transaction", "Bet", "Game", "Setting", "User" RESTART IDENTITY CASCADE',
  )
}

let seq = 0

export async function makeUser(over: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  seq++
  const username = over.username ?? `user${seq}`
  return prisma.user.create({
    data: {
      passwordHash: 'not-a-real-hash',
      referralCode: `CODE${String(seq).padStart(4, '0')}`,
      ...over,
      username,
      usernameKey: username.toLowerCase(),
      balance: 0, // balances are only changed via the ledger (see fundUser in Task 4)
    },
  })
}

export async function makeGame(over: Partial<Prisma.GameUncheckedCreateInput> = {}) {
  seq++
  return prisma.game.create({
    data: {
      externalId: 100_000 + seq,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
      ...over,
    },
  })
}
```

- [ ] **Step 5: Write the DB smoke test**

`tests/integration/db.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { makeGame, makeUser, resetDb } from '../helpers/db'

describe('database', () => {
  beforeEach(resetDb)

  it('creates users and games', async () => {
    const user = await makeUser({ username: 'Kyle' })
    await makeGame()
    expect(user.usernameKey).toBe('kyle')
    expect(await prisma.user.count()).toBe(1)
    expect(await prisma.game.count()).toBe(1)
  })

  it('enforces case-insensitive unique usernames via usernameKey', async () => {
    await makeUser({ username: 'Kyle' })
    await expect(makeUser({ username: 'kyle' })).rejects.toThrow()
  })
})
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all pass (smoke + 2 db tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, migration and test DB helpers"
```

---

### Task 3: Ending and payout math (pure functions)

**Files:**
- Create: `src/lib/game/ending.ts`, `src/lib/game/payout.ts`
- Test: `tests/unit/ending.test.ts`, `tests/unit/payout.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Ending = { awayDigit: number; homeDigit: number }`
  - `endingOf(awayScore: number, homeScore: number): Ending` (throws on negative/non-integer)
  - `formatEnding(e: Ending): string` → `"9-6"`
  - `PAYOUT_PERCENT = 90`
  - `type StakeEntry = { id: string; stake: number; isWinner: boolean }`
  - `type Split = { pool: number; houseTake: number; payouts: Map<string, number> }`
  - `computeSplit(bets: StakeEntry[]): Split`

- [ ] **Step 1: Write failing tests**

`tests/unit/ending.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { endingOf, formatEnding } from '@/lib/game/ending'

describe('endingOf', () => {
  it('takes the last digit of away and home scores', () => {
    expect(endingOf(99, 106)).toEqual({ awayDigit: 9, homeDigit: 6 })
  })
  it('handles scores ending in zero', () => {
    expect(endingOf(110, 100)).toEqual({ awayDigit: 0, homeDigit: 0 })
  })
  it('rejects invalid scores', () => {
    expect(() => endingOf(-1, 100)).toThrow()
    expect(() => endingOf(99.5, 100)).toThrow()
  })
})

describe('formatEnding', () => {
  it('formats away-home', () => {
    expect(formatEnding({ awayDigit: 9, homeDigit: 6 })).toBe('9-6')
  })
})
```

`tests/unit/payout.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { computeSplit } from '@/lib/game/payout'

describe('computeSplit', () => {
  it('splits 90% of the pool pro-rata by stake', () => {
    const s = computeSplit([
      { id: 'a', stake: 100, isWinner: true },
      { id: 'b', stake: 300, isWinner: true },
      { id: 'c', stake: 600, isWinner: false },
    ])
    expect(s.pool).toBe(1000)
    expect(s.payouts.get('a')).toBe(225)
    expect(s.payouts.get('b')).toBe(675)
    expect(s.payouts.has('c')).toBe(false)
    expect(s.houseTake).toBe(100)
  })

  it('floors payouts and gives the remainder to the house', () => {
    const s = computeSplit([
      { id: 'a', stake: 1, isWinner: true },
      { id: 'b', stake: 2, isWinner: true },
    ])
    // pool 3, payoutPool floor(2.7)=2, a=floor(2*1/3)=0, b=floor(2*2/3)=1
    expect(s.payouts.get('a')).toBe(0)
    expect(s.payouts.get('b')).toBe(1)
    expect(s.houseTake).toBe(2)
  })

  it('house keeps everything when there are no winners', () => {
    const s = computeSplit([
      { id: 'a', stake: 50, isWinner: false },
      { id: 'b', stake: 70, isWinner: false },
    ])
    expect(s.pool).toBe(120)
    expect(s.houseTake).toBe(120)
    expect(s.payouts.size).toBe(0)
  })

  it('handles an empty pool', () => {
    const s = computeSplit([])
    expect(s).toEqual({ pool: 0, houseTake: 0, payouts: new Map() })
  })

  it('does not lose precision on large stakes', () => {
    const s = computeSplit([
      { id: 'a', stake: 900_000_000, isWinner: true },
      { id: 'b', stake: 1_000_000_000, isWinner: false },
    ])
    expect(s.payouts.get('a')).toBe(1_710_000_000)
    expect(s.houseTake).toBe(190_000_000)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/ending.test.ts tests/unit/payout.test.ts`
Expected: FAIL, cannot resolve `@/lib/game/ending`.

- [ ] **Step 3: Implement**

`src/lib/game/ending.ts`:
```ts
export type Ending = { awayDigit: number; homeDigit: number }

export function endingOf(awayScore: number, homeScore: number): Ending {
  for (const s of [awayScore, homeScore]) {
    if (!Number.isInteger(s) || s < 0) throw new Error(`Invalid score: ${s}`)
  }
  return { awayDigit: awayScore % 10, homeDigit: homeScore % 10 }
}

export function formatEnding(e: Ending): string {
  return `${e.awayDigit}-${e.homeDigit}`
}
```

`src/lib/game/payout.ts`:
```ts
export const PAYOUT_PERCENT = 90

export type StakeEntry = { id: string; stake: number; isWinner: boolean }
export type Split = { pool: number; houseTake: number; payouts: Map<string, number> }

export function computeSplit(bets: StakeEntry[]): Split {
  const pool = bets.reduce((sum, b) => sum + b.stake, 0)
  const winners = bets.filter((b) => b.isWinner)
  const totalWinning = winners.reduce((sum, b) => sum + b.stake, 0)
  const payouts = new Map<string, number>()
  if (totalWinning === 0) return { pool, houseTake: pool, payouts }

  const payoutPool = BigInt(Math.floor((pool * PAYOUT_PERCENT) / 100))
  let paid = 0
  for (const w of winners) {
    const amount = Number((payoutPool * BigInt(w.stake)) / BigInt(totalWinning))
    payouts.set(w.id, amount)
    paid += amount
  }
  return { pool, houseTake: pool - paid, payouts }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ending and payout split math"
```

---

### Task 4: Domain errors, validation helper, and the points ledger

**Files:**
- Create: `src/lib/errors.ts`, `src/lib/validation.ts`, `src/server/ledger.ts`
- Modify: `tests/helpers/db.ts` (add `fundUser`, `expectLedgerConsistent`)
- Test: `tests/unit/validation.test.ts`, `tests/integration/ledger.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Tx` (Task 2)
- Produces:
  - `type DomainErrorCode = 'INSUFFICIENT_BALANCE' | 'BETTING_CLOSED' | 'STAKE_LIMIT' | 'SUSPENDED' | 'VALIDATION' | 'NOT_FOUND' | 'USERNAME_TAKEN' | 'INVALID_REFERRAL' | 'CONFLICT'`
  - `class DomainError extends Error { code: DomainErrorCode }`
  - `intFromForm(label: string, min: number, max: number)` → zod schema accepting a number or a digits-only string
  - `type LedgerEntry = { userId: string; type: TransactionType; amount: number; gameId?: string; betId?: string; adminId?: string; note?: string }`
  - `postEntry(tx: Tx, entry: LedgerEntry, opts?: { requireFunds?: boolean }): Promise<Transaction>`
  - Test helpers: `fundUser(userId: string, amount: number): Promise<void>`, `expectLedgerConsistent(): Promise<void>`

- [ ] **Step 1: Write failing tests**

`tests/unit/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { intFromForm } from '@/lib/validation'

const stake = intFromForm('Stake', 1, 1000)

describe('intFromForm', () => {
  it('accepts digit strings and numbers', () => {
    expect(stake.parse('25')).toBe(25)
    expect(stake.parse(' 25 ')).toBe(25)
    expect(stake.parse(25)).toBe(25)
  })
  it.each(['', '10.5', '-5', 'abc', '1e3', '0', '1001', null, undefined])('rejects %s', (v) => {
    const r = stake.safeParse(v)
    expect(r.success).toBe(false)
  })
  it('gives a readable message', () => {
    const r = stake.safeParse('abc')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('Stake must be a whole number')
  })
})
```

`tests/integration/ledger.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { postEntry } from '@/server/ledger'
import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('postEntry', () => {
  beforeEach(resetDb)

  it('credits the balance and records balanceAfter', async () => {
    const u = await makeUser()
    const t = await prisma.$transaction((tx) =>
      postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount: 500, note: 'hi' }),
    )
    expect(t.balanceAfter).toBe(500)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(500)
    await expectLedgerConsistent()
  })

  it('rejects a debit beyond the balance when requireFunds is set, changing nothing', async () => {
    const u = await makeUser()
    await prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount: 100 }))
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, { userId: u.id, type: 'BET', amount: -101 }, { requireFunds: true }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(100)
    expect(await prisma.transaction.count()).toBe(1)
  })

  it('allows a debit to go negative without requireFunds', async () => {
    const u = await makeUser()
    const t = await prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'REFUND', amount: -40 }))
    expect(t.balanceAfter).toBe(-40)
    await expectLedgerConsistent()
  })

  it('rejects zero and non-integer amounts', async () => {
    const u = await makeUser()
    for (const amount of [0, 1.5]) {
      await expect(
        prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount })),
      ).rejects.toBeInstanceOf(DomainError)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/validation.test.ts tests/integration/ledger.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement errors and validation**

`src/lib/errors.ts`:
```ts
export type DomainErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'BETTING_CLOSED'
  | 'STAKE_LIMIT'
  | 'SUSPENDED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'INVALID_REFERRAL'
  | 'CONFLICT'

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
```

`src/lib/validation.ts`:
```ts
import { z } from 'zod'

/** Integer from a form field: accepts numbers or digits-only strings; never coerces '' to 0. */
export function intFromForm(label: string, min: number, max: number) {
  const msg = `${label} must be a whole number`
  return z.preprocess(
    (v) => {
      if (typeof v === 'string') {
        const t = v.trim()
        return /^\d+$/.test(t) ? Number(t) : Number.NaN
      }
      return v
    },
    z
      .number({ invalid_type_error: msg, required_error: `${label} is required` })
      .int(msg)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`),
  )
}
```

- [ ] **Step 4: Implement the ledger**

`src/server/ledger.ts`:
```ts
import type { TransactionType } from '@prisma/client'
import type { Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'

export type LedgerEntry = {
  userId: string
  type: TransactionType
  amount: number
  gameId?: string
  betId?: string
  adminId?: string
  note?: string
}

/**
 * The ONLY way to change User.balance. Must be called inside prisma.$transaction.
 * requireFunds: the update only applies if the resulting balance stays >= 0.
 */
export async function postEntry(tx: Tx, entry: LedgerEntry, opts: { requireFunds?: boolean } = {}) {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    throw new DomainError('VALIDATION', 'Amount must be a non-zero whole number')
  }

  let balanceAfter: number
  if (opts.requireFunds) {
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE "User" SET balance = balance + ${entry.amount}
      WHERE id = ${entry.userId} AND balance + ${entry.amount} >= 0
      RETURNING balance`
    if (rows.length === 0) throw new DomainError('INSUFFICIENT_BALANCE', 'Insufficient balance')
    balanceAfter = rows[0].balance
  } else {
    const updated = await tx.user.update({
      where: { id: entry.userId },
      data: { balance: { increment: entry.amount } },
      select: { balance: true },
    })
    balanceAfter = updated.balance
  }

  return tx.transaction.create({ data: { ...entry, balanceAfter } })
}
```

- [ ] **Step 5: Add test helpers**

Append to `tests/helpers/db.ts`:
```ts
import { expect } from 'vitest'
import { postEntry } from '@/server/ledger'

export async function fundUser(userId: string, amount: number) {
  await prisma.$transaction((tx) =>
    postEntry(tx, { userId, type: 'ADMIN_GRANT', amount, note: 'test funding' }),
  )
}

export async function expectLedgerConsistent() {
  const rows = await prisma.$queryRaw<{ id: string; balance: number; total: number }[]>`
    SELECT u.id, u.balance, COALESCE(SUM(t.amount), 0)::int AS total
    FROM "User" u LEFT JOIN "Transaction" t ON t."userId" = u.id
    GROUP BY u.id`
  for (const r of rows) expect(r.balance, `user ${r.id}`).toBe(r.total)
}
```
(Move the new imports to the top of the file with the existing ones.)

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add domain errors, form int validation and points ledger"
```

---

### Task 5: Settings, audit log, registration and credentials

**Files:**
- Create: `src/lib/suspension.ts`, `src/server/passwords.ts`, `src/server/referral-code.ts`, `src/server/settings.ts`, `src/server/audit.ts`, `src/server/users.ts`
- Test: `tests/unit/suspension.test.ts`, `tests/integration/settings.test.ts`, `tests/integration/users.test.ts`

**Interfaces:**
- Consumes: `postEntry` (Task 4), `DomainError`, `intFromForm`, `prisma`, `Tx`
- Produces:
  - `isSuspended(u: { status: UserStatus; suspendedUntil: Date | null }, now?: Date): boolean`
  - `hashPassword(pw: string): Promise<string>`, `verifyPassword(pw: string, hash: string): Promise<boolean>`
  - `generateReferralCode(): string` (8 chars, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
  - `getReferralBonus(db?: Tx): Promise<number>`, `setReferralBonus(adminId: string, value: unknown): Promise<void>`, `getLastSyncAt(): Promise<Date | null>`, `setLastSyncAt(at: Date): Promise<void>`
  - `type AdminActionType = 'SUSPEND' | 'UNSUSPEND' | 'SET_STAKE_LIMIT' | 'RESET_PASSWORD' | 'VOID_GAME' | 'UPDATE_SETTING' | 'GRANT_POINTS' | 'DEDUCT_POINTS'`
  - `logAdminAction(tx: Tx, a: { adminId: string; action: AdminActionType; targetUserId?: string; targetGameId?: string; details?: Prisma.InputJsonObject }): Promise<void>`
  - `usernameSchema`, `passwordSchema` (zod)
  - `registerPlayer(input: unknown): Promise<User>` (input `{ username, password, referralCode? }`)
  - `verifyCredentials(username: string, password: string, now?: Date): Promise<User | null>`

- [ ] **Step 1: Write failing tests**

`tests/unit/suspension.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isSuspended } from '@/lib/suspension'

const now = new Date('2026-11-11T12:00:00Z')

describe('isSuspended', () => {
  it('active users are not suspended', () => {
    expect(isSuspended({ status: 'ACTIVE', suspendedUntil: null }, now)).toBe(false)
  })
  it('indefinite suspension', () => {
    expect(isSuspended({ status: 'SUSPENDED', suspendedUntil: null }, now)).toBe(true)
  })
  it('suspension until a future date', () => {
    expect(isSuspended({ status: 'SUSPENDED', suspendedUntil: new Date('2026-11-12T00:00:00Z') }, now)).toBe(true)
  })
  it('expired suspension counts as active', () => {
    expect(isSuspended({ status: 'SUSPENDED', suspendedUntil: new Date('2026-11-10T00:00:00Z') }, now)).toBe(false)
  })
})
```

`tests/integration/settings.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { getLastSyncAt, getReferralBonus, setLastSyncAt, setReferralBonus } from '@/server/settings'
import { makeUser, resetDb } from '../helpers/db'

describe('settings', () => {
  beforeEach(resetDb)

  it('referral bonus defaults to 500', async () => {
    expect(await getReferralBonus()).toBe(500)
  })

  it('admin can change the referral bonus, and it is audited', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await setReferralBonus(admin.id, '250')
    expect(await getReferralBonus()).toBe(250)
    const log = await prisma.adminAction.findFirstOrThrow()
    expect(log).toMatchObject({ adminId: admin.id, action: 'UPDATE_SETTING' })
  })

  it('rejects negative bonus', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await expect(setReferralBonus(admin.id, '-1')).rejects.toBeInstanceOf(ZodError)
  })

  it('stores last sync time', async () => {
    expect(await getLastSyncAt()).toBeNull()
    const at = new Date('2026-11-11T10:00:00Z')
    await setLastSyncAt(at)
    expect(await getLastSyncAt()).toEqual(at)
  })
})
```

`tests/integration/users.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { setReferralBonus } from '@/server/settings'
import { registerPlayer, verifyCredentials } from '@/server/users'
import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('registerPlayer', () => {
  beforeEach(resetDb)

  it('creates a player with hashed password, lowercase key and referral code', async () => {
    const u = await registerPlayer({ username: ' Kyle_1 ', password: 'secret123' })
    expect(u.username).toBe('Kyle_1')
    expect(u.usernameKey).toBe('kyle_1')
    expect(u.role).toBe('PLAYER')
    expect(u.balance).toBe(0)
    expect(u.passwordHash).not.toContain('secret123')
    expect(u.referralCode).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('rejects a username that differs only by case or whitespace', async () => {
    await registerPlayer({ username: 'kyle', password: 'secret123' })
    await expect(registerPlayer({ username: ' Kyle ', password: 'secret123' })).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    })
  })

  it.each(['ab', 'bad name!', 'x'.repeat(21)])('rejects invalid username %s', async (username) => {
    await expect(registerPlayer({ username, password: 'secret123' })).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects short passwords', async () => {
    await expect(registerPlayer({ username: 'kyle', password: 'short' })).rejects.toBeInstanceOf(ZodError)
  })

  it('credits the referrer with the referral bonus (case/space-insensitive code)', async () => {
    const referrer = await registerPlayer({ username: 'alice', password: 'secret123' })
    const bob = await registerPlayer({
      username: 'bob',
      password: 'secret123',
      referralCode: `  ${referrer.referralCode.toLowerCase()} `,
    })
    expect(bob.referredById).toBe(referrer.id)
    expect(bob.balance).toBe(0)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })
    expect(after.balance).toBe(500)
    const t = await prisma.transaction.findFirstOrThrow({ where: { userId: referrer.id } })
    expect(t).toMatchObject({ type: 'REFERRAL_BONUS', amount: 500, note: 'Referral: bob' })
    await expectLedgerConsistent()
  })

  it('rejects an unknown referral code and creates nothing', async () => {
    await expect(
      registerPlayer({ username: 'bob', password: 'secret123', referralCode: 'NOPE2345' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERRAL' })
    expect(await prisma.user.count()).toBe(0)
  })

  it('treats an empty referral code as none', async () => {
    const u = await registerPlayer({ username: 'bob', password: 'secret123', referralCode: '  ' })
    expect(u.referredById).toBeNull()
  })

  it('writes no bonus transaction when the bonus is 0', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    await setReferralBonus(admin.id, 0)
    const referrer = await registerPlayer({ username: 'alice', password: 'secret123' })
    await registerPlayer({ username: 'bob', password: 'secret123', referralCode: referrer.referralCode })
    expect(await prisma.transaction.count()).toBe(0)
  })
})

describe('verifyCredentials', () => {
  beforeEach(resetDb)

  it('returns the user for correct credentials, any username case', async () => {
    await registerPlayer({ username: 'Kyle', password: 'secret123' })
    expect((await verifyCredentials('KYLE', 'secret123'))?.username).toBe('Kyle')
  })

  it('returns null for wrong password or unknown user', async () => {
    await registerPlayer({ username: 'kyle', password: 'secret123' })
    expect(await verifyCredentials('kyle', 'wrongpass')).toBeNull()
    expect(await verifyCredentials('nobody', 'secret123')).toBeNull()
  })

  it('returns null while suspended, and the user after suspension expires', async () => {
    const u = await registerPlayer({ username: 'kyle', password: 'secret123' })
    await prisma.user.update({
      where: { id: u.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2026-11-12T00:00:00Z') },
    })
    expect(await verifyCredentials('kyle', 'secret123', new Date('2026-11-11T00:00:00Z'))).toBeNull()
    expect(await verifyCredentials('kyle', 'secret123', new Date('2026-11-13T00:00:00Z'))).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/suspension.test.ts tests/integration/settings.test.ts tests/integration/users.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement small modules**

`src/lib/suspension.ts`:
```ts
import type { UserStatus } from '@prisma/client'

export function isSuspended(
  u: { status: UserStatus; suspendedUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (u.status !== 'SUSPENDED') return false
  return u.suspendedUntil === null || u.suspendedUntil > now
}
```

`src/server/passwords.ts`:
```ts
import bcrypt from 'bcryptjs'

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}
```

`src/server/referral-code.ts`:
```ts
import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateReferralCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}
```

`src/server/audit.ts`:
```ts
import type { Prisma } from '@prisma/client'
import type { Tx } from '@/lib/db'

export type AdminActionType =
  | 'SUSPEND'
  | 'UNSUSPEND'
  | 'SET_STAKE_LIMIT'
  | 'RESET_PASSWORD'
  | 'VOID_GAME'
  | 'UPDATE_SETTING'
  | 'GRANT_POINTS'
  | 'DEDUCT_POINTS'

export async function logAdminAction(
  tx: Tx,
  a: {
    adminId: string
    action: AdminActionType
    targetUserId?: string
    targetGameId?: string
    details?: Prisma.InputJsonObject
  },
) {
  await tx.adminAction.create({ data: { ...a, details: a.details ?? {} } })
}
```

`src/server/settings.ts`:
```ts
import { prisma, type Tx } from '@/lib/db'
import { intFromForm } from '@/lib/validation'
import { logAdminAction } from './audit'

const DEFAULT_REFERRAL_BONUS = 500

export async function getReferralBonus(db: Tx = prisma): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: 'referralBonus' } })
  return row ? Number(row.value) : DEFAULT_REFERRAL_BONUS
}

export async function setReferralBonus(adminId: string, value: unknown): Promise<void> {
  const bonus = intFromForm('Referral bonus', 0, 1_000_000).parse(value)
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: 'referralBonus' },
      update: { value: String(bonus) },
      create: { key: 'referralBonus', value: String(bonus) },
    })
    await logAdminAction(tx, { adminId, action: 'UPDATE_SETTING', details: { key: 'referralBonus', value: bonus } })
  })
}

export async function getLastSyncAt(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: 'lastSyncAt' } })
  return row ? new Date(row.value) : null
}

export async function setLastSyncAt(at: Date): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'lastSyncAt' },
    update: { value: at.toISOString() },
    create: { key: 'lastSyncAt', value: at.toISOString() },
  })
}
```

- [ ] **Step 4: Implement users**

`src/server/users.ts`:
```ts
import { Prisma, type User } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'
import { postEntry } from './ledger'
import { hashPassword, verifyPassword } from './passwords'
import { generateReferralCode } from './referral-code'
import { getReferralBonus } from './settings'

export const usernameSchema = z
  .string({ required_error: 'Username is required' })
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Username must be 3–20 letters, numbers or underscores')

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')

const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined),
})

function isUniqueViolation(e: unknown, field: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    JSON.stringify(e.meta?.target ?? '').includes(field)
  )
}

export async function registerPlayer(input: unknown): Promise<User> {
  const { username, password, referralCode } = registerSchema.parse(input)
  const passwordHash = await hashPassword(password)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        let referrerId: string | undefined
        if (referralCode) {
          const referrer = await tx.user.findUnique({ where: { referralCode } })
          if (!referrer) throw new DomainError('INVALID_REFERRAL', 'Referral code not found')
          referrerId = referrer.id
        }
        const user = await tx.user.create({
          data: {
            username,
            usernameKey: username.toLowerCase(),
            passwordHash,
            referralCode: generateReferralCode(),
            referredById: referrerId,
          },
        })
        if (referrerId) {
          const bonus = await getReferralBonus(tx)
          if (bonus > 0) {
            await postEntry(tx, {
              userId: referrerId,
              type: 'REFERRAL_BONUS',
              amount: bonus,
              note: `Referral: ${username}`,
            })
          }
        }
        return user
      })
    } catch (e) {
      if (isUniqueViolation(e, 'usernameKey')) {
        throw new DomainError('USERNAME_TAKEN', 'That username is already taken')
      }
      if (isUniqueViolation(e, 'referralCode')) continue // generated code collided; retry
      throw e
    }
  }
  throw new Error('Could not generate a unique referral code')
}

export async function verifyCredentials(
  username: string,
  password: string,
  now: Date = new Date(),
): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { usernameKey: username.trim().toLowerCase() } })
  if (!user) return null
  if (!(await verifyPassword(password, user.passwordHash))) return null
  if (isSuspended(user, now)) return null
  return user
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add settings, admin audit log, registration and credentials"
```

---

### Task 6: Bet placement

**Files:**
- Create: `src/server/bets.ts`
- Test: `tests/integration/bets.test.ts`

**Interfaces:**
- Consumes: `postEntry`, `DomainError`, `intFromForm`, `isSuspended`, `prisma`
- Produces:
  - `placeBetSchema` (zod: `{ gameId: string, awayDigit: 0–9, homeDigit: 0–9, stake: 1–1,000,000,000 }`)
  - `placeBet(userId: string, input: unknown, now?: Date): Promise<Bet>`; errors: `SUSPENDED`, `NOT_FOUND`, `BETTING_CLOSED`, `STAKE_LIMIT`, `INSUFFICIENT_BALANCE`, `ZodError` for bad input

- [ ] **Step 1: Write failing tests**

`tests/integration/bets.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).balance
}

describe('placeBet', () => {
  beforeEach(resetDb)

  it('deducts the stake, records a BET transaction and grows the pool', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    const bet = await placeBet(u.id, { gameId: g.id, awayDigit: '9', homeDigit: '6', stake: '100' })
    expect(bet).toMatchObject({ awayDigit: 9, homeDigit: 6, stake: 100, result: 'PENDING' })
    expect(await balanceOf(u.id)).toBe(900)
    const t = await prisma.transaction.findFirstOrThrow({ where: { type: 'BET' } })
    expect(t).toMatchObject({ amount: -100, gameId: g.id, betId: bet.id, balanceAfter: 900 })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).pool).toBe(100)
    await expectLedgerConsistent()
  })

  it('merges a second stake on the same ending into one bet', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    const merged = await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 50 })
    expect(merged.stake).toBe(150)
    expect(await prisma.bet.count()).toBe(1)
    expect(await prisma.transaction.count({ where: { type: 'BET' } })).toBe(2)
  })

  it('allows multiple endings on one game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await placeBet(u.id, { gameId: g.id, awayDigit: 2, homeDigit: 4, stake: 100 })
    expect(await prisma.bet.count()).toBe(2)
  })

  it('rejects insufficient balance and creates nothing', async () => {
    const u = await makeUser()
    await fundUser(u.id, 50)
    const g = await makeGame()
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 51 })).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    })
    expect(await prisma.bet.count()).toBe(0)
    expect(await balanceOf(u.id)).toBe(50)
  })

  it('closes betting exactly at tip-off', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const startsAt = new Date('2026-11-11T23:00:00Z')
    const g = await makeGame({ startsAt })
    await expect(
      placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 }, startsAt),
    ).rejects.toMatchObject({ code: 'BETTING_CLOSED' })
    const ok = await placeBet(
      u.id,
      { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 },
      new Date(startsAt.getTime() - 1000),
    )
    expect(ok.stake).toBe(10)
  })

  it.each(['LIVE', 'FINAL', 'SETTLED', 'VOID', 'POSTPONED'] as const)('rejects bets on %s games', async (status) => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ status })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })).rejects.toMatchObject({
      code: 'BETTING_CLOSED',
    })
  })

  it('rejects an unknown game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    await expect(placeBet(u.id, { gameId: 'nope', awayDigit: 1, homeDigit: 1, stake: 10 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects suspended players but allows expired suspensions', async () => {
    const u = await makeUser({ status: 'SUSPENDED' })
    await fundUser(u.id, 100)
    const g = await makeGame()
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })).rejects.toMatchObject({
      code: 'SUSPENDED',
    })
    await prisma.user.update({ where: { id: u.id }, data: { suspendedUntil: new Date(Date.now() - 1000) } })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })).resolves.toBeTruthy()
  })

  it('enforces the per-game stake limit across all endings', async () => {
    const u = await makeUser({ stakeLimitPerGame: 100 })
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 60 })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 50 })).rejects.toMatchObject({
      code: 'STAKE_LIMIT',
      message: 'Stake limit exceeded (remaining: 40)',
    })
    await expect(placeBet(u.id, { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 40 })).resolves.toBeTruthy()
  })

  it('concurrent bets cannot overdraw the balance', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g1 = await makeGame()
    const g2 = await makeGame()
    const results = await Promise.allSettled([
      placeBet(u.id, { gameId: g1.id, awayDigit: 1, homeDigit: 1, stake: 80 }),
      placeBet(u.id, { gameId: g2.id, awayDigit: 1, homeDigit: 1, stake: 80 }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balanceOf(u.id)).toBe(20)
    await expectLedgerConsistent()
  })

  // Review Focus #1: junk numeric form input
  it.each([
    { stake: '' },
    { stake: '10.5' },
    { stake: '-5' },
    { stake: 'abc' },
    { stake: '0' },
    { stake: '1e3' },
    { awayDigit: '' },
    { awayDigit: '10' },
    { homeDigit: '-1' },
  ])('rejects junk input %o', async (override) => {
    const u = await makeUser()
    await fundUser(u.id, 10_000)
    const g = await makeGame()
    await expect(
      placeBet(u.id, { gameId: g.id, awayDigit: '1', homeDigit: '1', stake: '10', ...override }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await prisma.bet.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/bets.test.ts`
Expected: FAIL, cannot resolve `@/server/bets`.

- [ ] **Step 3: Implement**

`src/server/bets.ts`:
```ts
import type { Bet, GameStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { isSuspended } from '@/lib/suspension'
import { intFromForm } from '@/lib/validation'
import { postEntry } from './ledger'

export const placeBetSchema = z.object({
  gameId: z.string().min(1, 'Game is required'),
  awayDigit: intFromForm('Away digit', 0, 9),
  homeDigit: intFromForm('Home digit', 0, 9),
  stake: intFromForm('Stake', 1, 1_000_000_000),
})

export async function placeBet(userId: string, input: unknown, now: Date = new Date()): Promise<Bet> {
  const { gameId, awayDigit, homeDigit, stake } = placeBetSchema.parse(input)

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (isSuspended(user, now)) throw new DomainError('SUSPENDED', 'Account suspended')

    // Lock the game row: serializes bets on this game (stake-limit check is race-free)
    // and blocks status changes (sync/void) while the bet is written.
    const games = await tx.$queryRaw<{ id: string; status: GameStatus; startsAt: Date }[]>`
      SELECT id, status, "startsAt" FROM "Game" WHERE id = ${gameId} FOR UPDATE`
    const game = games[0]
    if (!game) throw new DomainError('NOT_FOUND', 'Game not found')
    if (game.status !== 'SCHEDULED' || now >= game.startsAt) {
      throw new DomainError('BETTING_CLOSED', 'Betting closed')
    }

    if (user.stakeLimitPerGame !== null) {
      const agg = await tx.bet.aggregate({ where: { userId, gameId }, _sum: { stake: true } })
      const already = agg._sum.stake ?? 0
      if (already + stake > user.stakeLimitPerGame) {
        const remaining = Math.max(0, user.stakeLimitPerGame - already)
        throw new DomainError('STAKE_LIMIT', `Stake limit exceeded (remaining: ${remaining})`)
      }
    }

    const bet = await tx.bet.upsert({
      where: { userId_gameId_awayDigit_homeDigit: { userId, gameId, awayDigit, homeDigit } },
      create: { userId, gameId, awayDigit, homeDigit, stake },
      update: { stake: { increment: stake } },
    })

    await postEntry(tx, { userId, type: 'BET', amount: -stake, gameId, betId: bet.id }, { requireFunds: true })
    await tx.game.update({ where: { id: gameId }, data: { pool: { increment: stake } } })
    return bet
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/integration/bets.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add bet placement with deadline, balance and stake-limit checks"
```

---

### Task 7: Settlement and void

**Files:**
- Create: `src/server/settlement.ts`
- Test: `tests/integration/settlement.test.ts`

**Interfaces:**
- Consumes: `endingOf`, `computeSplit`, `postEntry`, `logAdminAction`, `placeBet` (tests only), `DomainError`
- Produces:
  - `settleGame(gameId: string, now?: Date): Promise<{ settled: boolean }>`: no-op `{ settled: false }` unless status is FINAL
  - `voidGame(adminId: string, gameId: string, reason: unknown): Promise<void>`; errors `VALIDATION` (empty reason), `NOT_FOUND`, `CONFLICT` (already void)

- [ ] **Step 1: Write failing tests**

`tests/integration/settlement.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { settleGame, voidGame } from '@/server/settlement'
import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).balance
}

async function setupGame() {
  const a = await makeUser({ username: 'a' })
  const b = await makeUser({ username: 'b' })
  const c = await makeUser({ username: 'c' })
  for (const u of [a, b, c]) await fundUser(u.id, 1000)
  const g = await makeGame()
  await placeBet(a.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
  await placeBet(b.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 300 })
  await placeBet(c.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 600 })
  await prisma.game.update({ where: { id: g.id }, data: { status: 'FINAL', awayScore: 99, homeScore: 106 } })
  return { a, b, c, g }
}

describe('settleGame', () => {
  beforeEach(resetDb)

  it('pays winners pro-rata from 90% of the pool', async () => {
    const { a, b, c, g } = await setupGame()
    expect(await settleGame(g.id)).toEqual({ settled: true })
    expect(await balanceOf(a.id)).toBe(900 + 225)
    expect(await balanceOf(b.id)).toBe(700 + 675)
    expect(await balanceOf(c.id)).toBe(400)
    const game = await prisma.game.findUniqueOrThrow({ where: { id: g.id } })
    expect(game).toMatchObject({ status: 'SETTLED', pool: 1000, houseTake: 100 })
    expect(game.settledAt).not.toBeNull()
    const bets = await prisma.bet.findMany({ orderBy: { stake: 'asc' } })
    expect(bets.map((x) => [x.result, x.payout])).toEqual([
      ['WON', 225],
      ['WON', 675],
      ['LOST', 0],
    ])
    expect(await prisma.transaction.count({ where: { type: 'PAYOUT' } })).toBe(2)
    await expectLedgerConsistent()
  })

  it('house keeps everything when nobody wins', async () => {
    const { a, g } = await setupGame()
    await prisma.game.update({ where: { id: g.id }, data: { awayScore: 100, homeScore: 100 } })
    await settleGame(g.id)
    expect(await balanceOf(a.id)).toBe(900)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).houseTake).toBe(1000)
    expect(await prisma.bet.count({ where: { result: 'LOST' } })).toBe(3)
  })

  it('is idempotent: a second run pays nothing', async () => {
    const { a, g } = await setupGame()
    await settleGame(g.id)
    expect(await settleGame(g.id)).toEqual({ settled: false })
    expect(await balanceOf(a.id)).toBe(1125)
    await expectLedgerConsistent()
  })

  it('concurrent runs settle once', async () => {
    const { a, g } = await setupGame()
    const results = await Promise.all([settleGame(g.id), settleGame(g.id)])
    expect(results.filter((r) => r.settled)).toHaveLength(1)
    expect(await balanceOf(a.id)).toBe(1125)
  })

  it('does nothing for non-final games', async () => {
    const g = await makeGame({ status: 'LIVE' })
    expect(await settleGame(g.id)).toEqual({ settled: false })
  })

  it('settles a game with no bets', async () => {
    const g = await makeGame({ status: 'FINAL', awayScore: 99, homeScore: 106 })
    await settleGame(g.id)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'SETTLED',
      pool: 0,
      houseTake: 0,
    })
  })
})

describe('voidGame', () => {
  beforeEach(resetDb)

  it('refunds all stakes on an unsettled game', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { a, b, c, g } = await setupGame()
    await voidGame(admin.id, g.id, 'Postponed')
    for (const u of [a, b, c]) expect(await balanceOf(u.id)).toBe(1000)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'VOID',
      voidReason: 'Postponed',
      houseTake: 0,
    })
    expect(await prisma.bet.count({ where: { result: 'REFUNDED' } })).toBe(3)
    expect(await prisma.adminAction.count({ where: { action: 'VOID_GAME' } })).toBe(1)
    await expectLedgerConsistent()
  })

  it('reverses payouts on a settled game', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { a, b, c, g } = await setupGame()
    await settleGame(g.id)
    await voidGame(admin.id, g.id, 'Wrong score')
    for (const u of [a, b, c]) expect(await balanceOf(u.id)).toBe(1000)
    const reversals = await prisma.transaction.findMany({ where: { type: 'REFUND', amount: { lt: 0 } } })
    expect(reversals.map((t) => t.amount).sort((x, y) => x - y)).toEqual([-675, -225])
    expect((await prisma.bet.findMany()).every((x) => x.payout === 0)).toBe(true)
    await expectLedgerConsistent()
  })

  it('a reversal can leave a negative balance', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const winner = await makeUser({ username: 'w' })
    const loser = await makeUser({ username: 'l' })
    await fundUser(winner.id, 100)
    await fundUser(loser.id, 900)
    const g = await makeGame()
    await placeBet(winner.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await placeBet(loser.id, { gameId: g.id, awayDigit: 0, homeDigit: 0, stake: 900 })
    await prisma.game.update({ where: { id: g.id }, data: { status: 'FINAL', awayScore: 99, homeScore: 106 } })
    await settleGame(g.id) // winner gets 900
    const g2 = await makeGame()
    await placeBet(winner.id, { gameId: g2.id, awayDigit: 1, homeDigit: 1, stake: 900 }) // spends it
    await voidGame(admin.id, g.id, 'Bad data')
    expect(await balanceOf(winner.id)).toBe(100 - 900) // +100 refund, -900 reversal from 0
    await expectLedgerConsistent()
  })

  it('rejects voiding twice, empty reasons and unknown games', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const g = await makeGame()
    await expect(voidGame(admin.id, g.id, '  ')).rejects.toMatchObject({ code: 'VALIDATION' })
    await voidGame(admin.id, g.id, 'Cancelled')
    await expect(voidGame(admin.id, g.id, 'Again')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(voidGame(admin.id, 'nope', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('a voided game cannot be settled', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const { g } = await setupGame()
    await voidGame(admin.id, g.id, 'Bad data')
    expect(await settleGame(g.id)).toEqual({ settled: false })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/settlement.test.ts`
Expected: FAIL, cannot resolve `@/server/settlement`.

- [ ] **Step 3: Implement**

`src/server/settlement.ts`:
```ts
import type { GameStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { endingOf } from '@/lib/game/ending'
import { computeSplit } from '@/lib/game/payout'
import { logAdminAction } from './audit'
import { postEntry } from './ledger'

export async function settleGame(gameId: string, now: Date = new Date()): Promise<{ settled: boolean }> {
  return prisma.$transaction(
    async (tx) => {
      // Claim the game atomically; concurrent or repeated runs get count 0.
      const claimed = await tx.game.updateMany({
        where: { id: gameId, status: 'FINAL' },
        data: { status: 'SETTLED', settledAt: now },
      })
      if (claimed.count === 0) return { settled: false }

      const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } })
      if (game.awayScore === null || game.homeScore === null) {
        throw new Error(`Game ${gameId} is FINAL without scores`) // rolls back the claim
      }
      const ending = endingOf(game.awayScore, game.homeScore)
      const bets = await tx.bet.findMany({ where: { gameId } })
      const split = computeSplit(
        bets.map((b) => ({
          id: b.id,
          stake: b.stake,
          isWinner: b.awayDigit === ending.awayDigit && b.homeDigit === ending.homeDigit,
        })),
      )

      for (const bet of bets) {
        const payout = split.payouts.get(bet.id)
        if (payout === undefined) {
          await tx.bet.update({ where: { id: bet.id }, data: { result: 'LOST' } })
          continue
        }
        await tx.bet.update({ where: { id: bet.id }, data: { result: 'WON', payout } })
        if (payout > 0) {
          await postEntry(tx, { userId: bet.userId, type: 'PAYOUT', amount: payout, gameId, betId: bet.id })
        }
      }

      await tx.game.update({ where: { id: gameId }, data: { pool: split.pool, houseTake: split.houseTake } })
      return { settled: true }
    },
    { timeout: 30_000 },
  )
}

export async function voidGame(adminId: string, gameId: string, reason: unknown): Promise<void> {
  const why = typeof reason === 'string' ? reason.trim() : ''
  if (!why) throw new DomainError('VALIDATION', 'A reason is required')

  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; status: GameStatus }[]>`
        SELECT id, status FROM "Game" WHERE id = ${gameId} FOR UPDATE`
      const game = rows[0]
      if (!game) throw new DomainError('NOT_FOUND', 'Game not found')
      if (game.status === 'VOID') throw new DomainError('CONFLICT', 'Game is already void')

      const bets = await tx.bet.findMany({ where: { gameId } })
      for (const bet of bets) {
        if (bet.payout > 0) {
          await postEntry(tx, {
            userId: bet.userId,
            type: 'REFUND',
            amount: -bet.payout,
            gameId,
            betId: bet.id,
            adminId,
            note: 'Payout reversal',
          })
        }
        await postEntry(tx, {
          userId: bet.userId,
          type: 'REFUND',
          amount: bet.stake,
          gameId,
          betId: bet.id,
          adminId,
          note: `Game voided: ${why}`,
        })
        await tx.bet.update({ where: { id: bet.id }, data: { result: 'REFUNDED', payout: 0 } })
      }

      await tx.game.update({ where: { id: gameId }, data: { status: 'VOID', voidReason: why, houseTake: 0 } })
      await logAdminAction(tx, {
        adminId,
        action: 'VOID_GAME',
        targetGameId: gameId,
        details: { reason: why, previousStatus: game.status },
      })
    },
    { timeout: 30_000 },
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add idempotent settlement and game void with refunds"
```

---

### Task 8: balldontlie sync and cron endpoint

**Files:**
- Create: `src/server/sync/balldontlie.ts`, `src/server/sync/sync.ts`, `src/app/api/cron/sync/route.ts`
- Test: `tests/unit/balldontlie.test.ts`, `tests/integration/sync.test.ts`

**Interfaces:**
- Consumes: `settleGame` (Task 7), `setLastSyncAt` (Task 5), `prisma`
- Produces:
  - `type ApiGame` (balldontlie v1 game shape, see code)
  - `type MappedGame = { externalId: number; startsAt: Date; awayTeam: string; homeTeam: string; awayScore: number | null; homeScore: number | null; status: 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED' }`
  - `mapApiGame(g: ApiGame): MappedGame | null`
  - `type GamesFetcher = (dates: string[]) => Promise<ApiGame[]>`
  - `createBalldontlieFetcher(apiKey: string, fetchImpl?: typeof fetch, baseUrl?: string): GamesFetcher`
  - `syncDates(now: Date): string[]` (yesterday … +7 days, US Eastern, `YYYY-MM-DD`)
  - `type SyncResult = { fetched: number; created: number; updated: number; skipped: number; settled: number }`
  - `syncGames(opts: { fetchGames: GamesFetcher; now?: Date }): Promise<SyncResult>`
  - `defaultFetcher(): GamesFetcher` (reads `BALLDONTLIE_API_KEY`, throws if empty)
  - `GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET`

- [ ] **Step 1: Write failing unit tests**

`tests/unit/balldontlie.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createBalldontlieFetcher, mapApiGame, type ApiGame } from '@/server/sync/balldontlie'
import { syncDates } from '@/server/sync/sync'

function apiGame(over: Partial<ApiGame> = {}): ApiGame {
  return {
    id: 1,
    date: '2026-11-11',
    datetime: '2026-11-12T00:00:00.000Z',
    status: 'Final',
    period: 4,
    home_team_score: 106,
    visitor_team_score: 99,
    home_team: { abbreviation: 'GSW' },
    visitor_team: { abbreviation: 'LAL' },
    ...over,
  }
}

describe('mapApiGame', () => {
  it('maps a final game (visitor = away)', () => {
    expect(mapApiGame(apiGame())).toEqual({
      externalId: 1,
      startsAt: new Date('2026-11-12T00:00:00.000Z'),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      awayScore: 99,
      homeScore: 106,
      status: 'FINAL',
    })
  })

  it('maps a live game', () => {
    expect(mapApiGame(apiGame({ status: '3rd Qtr', period: 3 }))?.status).toBe('LIVE')
  })

  it('maps a scheduled game with null scores', () => {
    const m = mapApiGame(apiGame({ status: '7:00 pm ET', period: 0, home_team_score: 0, visitor_team_score: 0 }))
    expect(m).toMatchObject({ status: 'SCHEDULED', awayScore: null, homeScore: null })
  })

  it('uses an ISO status as tip-off time when datetime is missing', () => {
    const m = mapApiGame(apiGame({ datetime: null, status: '2026-11-12T00:30:00Z', period: 0 }))
    expect(m?.startsAt).toEqual(new Date('2026-11-12T00:30:00Z'))
  })

  it('skips a scheduled game with no known tip-off time', () => {
    expect(mapApiGame(apiGame({ datetime: null, status: 'TBD', period: 0 }))).toBeNull()
  })

  it('maps postponed games', () => {
    expect(mapApiGame(apiGame({ status: 'Postponed', period: 0 }))?.status).toBe('POSTPONED')
  })

  // Review Focus #3
  it('skips a Final game with missing scores', () => {
    expect(mapApiGame(apiGame({ home_team_score: 0, visitor_team_score: 0 }))).toBeNull()
  })
})

describe('createBalldontlieFetcher', () => {
  it('sends the API key, all dates, and follows cursors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [apiGame({ id: 1 })], meta: { next_cursor: 5 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [apiGame({ id: 2 })], meta: { next_cursor: null } })))
    const fetchGames = createBalldontlieFetcher('KEY', fetchImpl as unknown as typeof fetch, 'https://x.test/v1')
    const games = await fetchGames(['2026-11-10', '2026-11-11'])
    expect(games.map((g) => g.id)).toEqual([1, 2])
    const [url1, init1] = fetchImpl.mock.calls[0]
    expect(String(url1)).toBe('https://x.test/v1/games?dates%5B%5D=2026-11-10&dates%5B%5D=2026-11-11&per_page=100')
    expect(init1.headers).toEqual({ Authorization: 'KEY' })
    expect(String(fetchImpl.mock.calls[1][0])).toContain('cursor=5')
  })

  it('throws on HTTP errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 429 }))
    const fetchGames = createBalldontlieFetcher('KEY', fetchImpl as unknown as typeof fetch)
    await expect(fetchGames(['2026-11-11'])).rejects.toThrow('balldontlie 429')
  })
})

describe('syncDates', () => {
  it('returns yesterday through +7 days in US Eastern', () => {
    // 03:00 UTC on Nov 11 is 22:00 ET on Nov 10
    expect(syncDates(new Date('2026-11-11T03:00:00Z'))).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ])
  })
})
```

- [ ] **Step 2: Write failing integration tests**

`tests/integration/sync.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { getLastSyncAt } from '@/server/settings'
import type { ApiGame } from '@/server/sync/balldontlie'
import { syncGames } from '@/server/sync/sync'
import { GET } from '@/app/api/cron/sync/route'
import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

function apiGame(over: Partial<ApiGame> = {}): ApiGame {
  return {
    id: 501,
    date: '2026-11-11',
    datetime: '2026-11-12T00:00:00.000Z',
    status: '7:00 pm ET',
    period: 0,
    home_team_score: 0,
    visitor_team_score: 0,
    home_team: { abbreviation: 'GSW' },
    visitor_team: { abbreviation: 'LAL' },
    ...over,
  }
}
const fetcher = (games: ApiGame[]) => async () => games

describe('syncGames', () => {
  beforeEach(resetDb)

  it('creates new games and records the sync time', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const r = await syncGames({ fetchGames: fetcher([apiGame()]), now })
    expect(r).toMatchObject({ fetched: 1, created: 1 })
    expect(await prisma.game.findUniqueOrThrow({ where: { externalId: 501 } })).toMatchObject({
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    })
    expect(await getLastSyncAt()).toEqual(now)
  })

  it('updates scores and settles games that went final', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ externalId: 501 })
    await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    const r = await syncGames({
      fetchGames: fetcher([apiGame({ status: 'Final', period: 4, visitor_team_score: 99, home_team_score: 106 })]),
    })
    expect(r.settled).toBe(1)
    expect(await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({
      status: 'SETTLED',
      awayScore: 99,
      homeScore: 106,
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).balance).toBe(90)
  })

  it('never touches settled or void games', async () => {
    const g = await makeGame({ externalId: 501, status: 'VOID' })
    await syncGames({ fetchGames: fetcher([apiGame({ status: 'Final', period: 4, visitor_team_score: 1, home_team_score: 2 })]) })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('VOID')
  })

  // Review Focus #4
  it('updates tip-off time of a rescheduled game, keeping bets', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame({ externalId: 501, startsAt: new Date(Date.now() + 3600_000) })
    await placeBet(u.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 })
    const newTime = new Date(Date.now() + 2 * 86400_000)
    await syncGames({ fetchGames: fetcher([apiGame({ datetime: newTime.toISOString() })]) })
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).startsAt).toEqual(newTime)
    expect(await prisma.bet.count({ where: { gameId: g.id } })).toBe(1)
  })

  // Review Focus #3
  it('does not mark a game final when the API gives Final without scores', async () => {
    const g = await makeGame({ externalId: 501, status: 'LIVE' })
    const r = await syncGames({ fetchGames: fetcher([apiGame({ status: 'Final', period: 4 })]) })
    expect(r.skipped).toBe(1)
    expect((await prisma.game.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('LIVE')
  })

  it('flags postponed games and does not settle them', async () => {
    await syncGames({ fetchGames: fetcher([apiGame({ status: 'Postponed' })]) })
    expect((await prisma.game.findUniqueOrThrow({ where: { externalId: 501 } })).status).toBe('POSTPONED')
  })

  it('propagates fetch errors without updating the sync time', async () => {
    await expect(
      syncGames({
        fetchGames: async () => {
          throw new Error('down')
        },
      }),
    ).rejects.toThrow('down')
    expect(await getLastSyncAt()).toBeNull()
  })
})

describe('GET /api/cron/sync', () => {
  it('rejects requests without the cron secret', async () => {
    const res = await GET(new Request('http://localhost/api/cron/sync'))
    expect(res.status).toBe(401)
    const res2 = await GET(new Request('http://localhost/api/cron/sync', { headers: { authorization: 'Bearer wrong' } }))
    expect(res2.status).toBe(401)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/balldontlie.test.ts tests/integration/sync.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the API client**

`src/server/sync/balldontlie.ts`:
```ts
export type ApiGame = {
  id: number
  date: string // YYYY-MM-DD (US date of the game)
  datetime?: string | null // ISO tip-off time (newer API versions)
  status: string // "Final", "3rd Qtr", "Halftime", "7:00 pm ET", ISO time, "Postponed"
  period: number // 0 before tip-off
  home_team_score: number
  visitor_team_score: number
  home_team: { abbreviation: string }
  visitor_team: { abbreviation: string }
}

export type MappedGame = {
  externalId: number
  startsAt: Date
  awayTeam: string
  homeTeam: string
  awayScore: number | null
  homeScore: number | null
  status: 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED'
}

export type GamesFetcher = (dates: string[]) => Promise<ApiGame[]>

function parseIso(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}T/.test(s)) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Returns null when the record is unusable (logged by the caller as skipped). */
export function mapApiGame(g: ApiGame): MappedGame | null {
  const s = g.status.trim()
  let status: MappedGame['status']
  if (/^final/i.test(s)) status = 'FINAL'
  else if (/postpon|cancel|suspend/i.test(s)) status = 'POSTPONED'
  else if (g.period > 0) status = 'LIVE'
  else status = 'SCHEDULED'

  if (status === 'FINAL' && (!(g.home_team_score > 0) || !(g.visitor_team_score > 0))) return null

  const tipoff = parseIso(g.datetime) ?? parseIso(s)
  if (!tipoff && status === 'SCHEDULED') return null // never open betting without a real tip-off time
  const startsAt = tipoff ?? new Date(`${g.date}T00:00:00Z`)

  const hasScores = status === 'LIVE' || status === 'FINAL'
  return {
    externalId: g.id,
    startsAt,
    awayTeam: g.visitor_team.abbreviation,
    homeTeam: g.home_team.abbreviation,
    awayScore: hasScores ? g.visitor_team_score : null,
    homeScore: hasScores ? g.home_team_score : null,
    status,
  }
}

export function createBalldontlieFetcher(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl = 'https://api.balldontlie.io/v1',
): GamesFetcher {
  return async (dates) => {
    const out: ApiGame[] = []
    let cursor: number | null | undefined
    do {
      const url = new URL(`${baseUrl}/games`)
      for (const d of dates) url.searchParams.append('dates[]', d)
      url.searchParams.set('per_page', '100')
      if (cursor) url.searchParams.set('cursor', String(cursor))
      const res = await fetchImpl(url, { headers: { Authorization: apiKey } })
      if (!res.ok) throw new Error(`balldontlie ${res.status}: ${await res.text()}`)
      const json = (await res.json()) as { data: ApiGame[]; meta?: { next_cursor?: number | null } }
      out.push(...json.data)
      cursor = json.meta?.next_cursor
    } while (cursor)
    return out
  }
}
```

- [ ] **Step 5: Implement the sync service**

`src/server/sync/sync.ts`:
```ts
import { prisma } from '@/lib/db'
import { setLastSyncAt } from '../settings'
import { settleGame } from '../settlement'
import { createBalldontlieFetcher, mapApiGame, type GamesFetcher } from './balldontlie'

export type SyncResult = { fetched: number; created: number; updated: number; skipped: number; settled: number }

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function syncDates(now: Date): string[] {
  const today = easternDate.format(now) // YYYY-MM-DD
  const base = new Date(`${today}T12:00:00Z`)
  const dates: string[] = []
  for (let offset = -1; offset <= 7; offset++) {
    dates.push(new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10))
  }
  return dates
}

export function defaultFetcher(): GamesFetcher {
  const key = process.env.BALLDONTLIE_API_KEY
  if (!key) throw new Error('BALLDONTLIE_API_KEY is not set')
  return createBalldontlieFetcher(key)
}

export async function syncGames({
  fetchGames,
  now = new Date(),
}: {
  fetchGames: GamesFetcher
  now?: Date
}): Promise<SyncResult> {
  const apiGames = await fetchGames(syncDates(now))
  const result: SyncResult = { fetched: apiGames.length, created: 0, updated: 0, skipped: 0, settled: 0 }

  for (const apiGame of apiGames) {
    const mapped = mapApiGame(apiGame)
    if (!mapped) {
      result.skipped++
      console.warn('sync: skipped unusable game', apiGame.id, apiGame.status)
      continue
    }
    const existing = await prisma.game.findUnique({ where: { externalId: mapped.externalId } })
    if (!existing) {
      await prisma.game.upsert({ where: { externalId: mapped.externalId }, create: mapped, update: {} })
      result.created++
      continue
    }
    // FINAL is awaiting settlement; SETTLED/VOID are terminal. Never move these.
    if (existing.status === 'FINAL' || existing.status === 'SETTLED' || existing.status === 'VOID') continue

    const reschedulable = existing.status === 'SCHEDULED' || existing.status === 'POSTPONED'
    await prisma.game.update({
      where: { id: existing.id },
      data: {
        status: mapped.status,
        awayTeam: mapped.awayTeam,
        homeTeam: mapped.homeTeam,
        awayScore: mapped.awayScore,
        homeScore: mapped.homeScore,
        ...(reschedulable ? { startsAt: mapped.startsAt } : {}),
      },
    })
    result.updated++
  }

  const finals = await prisma.game.findMany({ where: { status: 'FINAL' }, select: { id: true } })
  for (const g of finals) {
    if ((await settleGame(g.id, now)).settled) result.settled++
  }

  await setLastSyncAt(now)
  return result
}
```

- [ ] **Step 6: Implement the cron route**

`src/app/api/cron/sync/route.ts`:
```ts
import { defaultFetcher, syncGames } from '@/server/sync/sync'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await syncGames({ fetchGames: defaultFetcher() })
    return Response.json(result)
  } catch (e) {
    console.error('sync failed', e)
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add balldontlie sync with auto-settlement and cron endpoint"
```

---

### Task 9: Admin player management and admin queries

**Files:**
- Create: `src/server/admin/players.ts`, `src/server/admin/queries.ts`
- Test: `tests/integration/admin-players.test.ts`, `tests/integration/admin-queries.test.ts`

**Interfaces:**
- Consumes: `postEntry`, `logAdminAction`, `hashPassword`, `passwordSchema`, `intFromForm`, `getLastSyncAt`, `verifyCredentials` (tests)
- Produces:
  - `adjustPoints(adminId: string, userId: string, input: unknown): Promise<void>` (input `{ direction: 'GRANT' | 'DEDUCT', amount, note }`)
  - `suspendPlayer(adminId: string, userId: string, until: Date | null, now?: Date): Promise<void>`
  - `unsuspendPlayer(adminId: string, userId: string): Promise<void>`
  - `setStakeLimit(adminId: string, userId: string, limit: unknown): Promise<void>` (`null` clears)
  - `resetPassword(adminId: string, userId: string, newPassword: unknown): Promise<void>`
  - `getDashboardStats(now?: Date)` → `{ playerCount, openPoolCount, openPoolTotal, houseTakeTotal, openInquiries, negativeBalances: { id, username, balance }[], lastSyncAt: Date | null, syncStale: boolean, postponedCount }`
  - `searchPlayers(q?: string)`, `getPlayerDetail(id: string)`, `listGamesAdmin(status?: GameStatus)`, `listTransactionsAdmin(f: { username?: string; type?: TransactionType; from?: Date; to?: Date })`, `listAdminActions()`

- [ ] **Step 1: Write failing tests**

`tests/integration/admin-players.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import {
  adjustPoints,
  resetPassword,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { registerPlayer, verifyCredentials } from '@/server/users'
import { expectLedgerConsistent, makeUser, resetDb } from '../helpers/db'

describe('admin player management', () => {
  beforeEach(resetDb)

  it('grants points with a note and audits it', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: '1000', note: 'Welcome' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(1000)
    expect(await prisma.transaction.findFirstOrThrow()).toMatchObject({
      type: 'ADMIN_GRANT',
      amount: 1000,
      adminId: admin.id,
      note: 'Welcome',
    })
    expect(await prisma.adminAction.findFirstOrThrow()).toMatchObject({ action: 'GRANT_POINTS', targetUserId: p.id })
    await expectLedgerConsistent()
  })

  it('deducts points but not below zero', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 100, note: 'x' })
    await adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 40, note: 'correction' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(60)
    await expect(
      adjustPoints(admin.id, p.id, { direction: 'DEDUCT', amount: 61, note: 'too much' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
  })

  it('requires a note', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await expect(adjustPoints(admin.id, p.id, { direction: 'GRANT', amount: 1, note: '  ' })).rejects.toBeInstanceOf(
      ZodError,
    )
  })

  it('only targets players', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const other = await makeUser({ role: 'ADMIN' })
    await expect(
      adjustPoints(admin.id, other.id, { direction: 'GRANT', amount: 1, note: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('suspends indefinitely, blocks login, and unsuspends', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await registerPlayer({ username: 'kyle', password: 'secret123' })
    await suspendPlayer(admin.id, p.id, null)
    expect(await verifyCredentials('kyle', 'secret123')).toBeNull()
    await unsuspendPlayer(admin.id, p.id)
    expect(await verifyCredentials('kyle', 'secret123')).not.toBeNull()
    const actions = await prisma.adminAction.findMany({ orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['SUSPEND', 'UNSUSPEND'])
  })

  it('rejects a suspension end date in the past', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    const now = new Date('2026-11-11T00:00:00Z')
    await expect(suspendPlayer(admin.id, p.id, new Date('2026-11-10T00:00:00Z'), now)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('sets and clears the stake limit', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await setStakeLimit(admin.id, p.id, '500')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).stakeLimitPerGame).toBe(500)
    await setStakeLimit(admin.id, p.id, null)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).stakeLimitPerGame).toBeNull()
    await expect(setStakeLimit(admin.id, p.id, '0')).rejects.toBeInstanceOf(ZodError)
  })

  it('resets the password', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await registerPlayer({ username: 'kyle', password: 'secret123' })
    await resetPassword(admin.id, p.id, 'newpass123')
    expect(await verifyCredentials('kyle', 'secret123')).toBeNull()
    expect(await verifyCredentials('kyle', 'newpass123')).not.toBeNull()
    const log = await prisma.adminAction.findFirstOrThrow({ where: { action: 'RESET_PASSWORD' } })
    expect(JSON.stringify(log.details)).not.toContain('newpass123')
  })
})
```

`tests/integration/admin-queries.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { getDashboardStats, listTransactionsAdmin, searchPlayers } from '@/server/admin/queries'
import { postEntry } from '@/server/ledger'
import { setLastSyncAt } from '@/server/settings'
import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('admin queries', () => {
  beforeEach(resetDb)

  it('computes dashboard stats', async () => {
    await makeUser({ role: 'ADMIN' })
    const p = await makeUser({ username: 'neg' })
    await makeUser({ username: 'ok' })
    await prisma.$transaction((tx) => postEntry(tx, { userId: p.id, type: 'REFUND', amount: -50 }))
    await makeGame({ status: 'SETTLED', pool: 1000, houseTake: 100 })
    await makeGame({ status: 'SETTLED', pool: 500, houseTake: 500 })
    await makeGame({ status: 'SCHEDULED', pool: 300 })
    await makeGame({ status: 'POSTPONED' })
    const now = new Date('2026-11-11T12:00:00Z')
    await setLastSyncAt(new Date('2026-11-11T11:00:00Z'))

    const s = await getDashboardStats(now)
    expect(s).toMatchObject({
      playerCount: 2,
      openPoolCount: 1,
      openPoolTotal: 300,
      houseTakeTotal: 600,
      openInquiries: 0,
      postponedCount: 1,
      syncStale: true,
    })
    expect(s.negativeBalances).toEqual([{ id: p.id, username: 'neg', balance: -50 }])
  })

  it('reports sync as fresh within 30 minutes', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    await setLastSyncAt(new Date('2026-11-11T11:45:00Z'))
    expect((await getDashboardStats(now)).syncStale).toBe(false)
  })

  it('searches players case-insensitively and filters transactions', async () => {
    const kyle = await makeUser({ username: 'Kyle' })
    await makeUser({ username: 'bob' })
    await makeUser({ username: 'boss', role: 'ADMIN' })
    expect((await searchPlayers('KY')).map((u) => u.username)).toEqual(['Kyle'])
    await fundUser(kyle.id, 10)
    const txs = await listTransactionsAdmin({ username: 'KYLE', type: 'ADMIN_GRANT' })
    expect(txs).toHaveLength(1)
    expect(txs[0].user.username).toBe('Kyle')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/admin-players.test.ts tests/integration/admin-queries.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement player management**

`src/server/admin/players.ts`:
```ts
import { z } from 'zod'
import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { intFromForm } from '@/lib/validation'
import { logAdminAction } from '../audit'
import { postEntry } from '../ledger'
import { hashPassword } from '../passwords'
import { passwordSchema } from '../users'

async function requirePlayer(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'PLAYER') throw new DomainError('NOT_FOUND', 'Player not found')
  return user
}

const adjustSchema = z.object({
  direction: z.enum(['GRANT', 'DEDUCT'], { errorMap: () => ({ message: 'Choose grant or deduct' }) }),
  amount: intFromForm('Amount', 1, 1_000_000_000),
  note: z.string({ required_error: 'A note is required' }).trim().min(1, 'A note is required').max(500),
})

export async function adjustPoints(adminId: string, userId: string, input: unknown): Promise<void> {
  const { direction, amount, note } = adjustSchema.parse(input)
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    const grant = direction === 'GRANT'
    await postEntry(
      tx,
      { userId, type: grant ? 'ADMIN_GRANT' : 'ADMIN_DEDUCT', amount: grant ? amount : -amount, adminId, note },
      { requireFunds: !grant },
    )
    await logAdminAction(tx, {
      adminId,
      action: grant ? 'GRANT_POINTS' : 'DEDUCT_POINTS',
      targetUserId: userId,
      details: { amount, note },
    })
  })
}

export async function suspendPlayer(
  adminId: string,
  userId: string,
  until: Date | null,
  now: Date = new Date(),
): Promise<void> {
  if (until && until <= now) throw new DomainError('VALIDATION', 'Suspension end must be in the future')
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { status: 'SUSPENDED', suspendedUntil: until } })
    await logAdminAction(tx, {
      adminId,
      action: 'SUSPEND',
      targetUserId: userId,
      details: { until: until ? until.toISOString() : null },
    })
  })
}

export async function unsuspendPlayer(adminId: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE', suspendedUntil: null } })
    await logAdminAction(tx, { adminId, action: 'UNSUSPEND', targetUserId: userId })
  })
}

const stakeLimitSchema = z.union([z.null(), intFromForm('Stake limit', 1, 1_000_000_000)])

export async function setStakeLimit(adminId: string, userId: string, limit: unknown): Promise<void> {
  const value = stakeLimitSchema.parse(limit)
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { stakeLimitPerGame: value } })
    await logAdminAction(tx, { adminId, action: 'SET_STAKE_LIMIT', targetUserId: userId, details: { limit: value } })
  })
}

export async function resetPassword(adminId: string, userId: string, newPassword: unknown): Promise<void> {
  const pw = passwordSchema.parse(newPassword)
  const passwordHash = await hashPassword(pw)
  await prisma.$transaction(async (tx) => {
    await requirePlayer(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await logAdminAction(tx, { adminId, action: 'RESET_PASSWORD', targetUserId: userId })
  })
}
```

- [ ] **Step 4: Implement admin queries**

`src/server/admin/queries.ts`:
```ts
import type { GameStatus, TransactionType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getLastSyncAt } from '../settings'

const SYNC_STALE_MS = 30 * 60 * 1000

export async function getDashboardStats(now: Date = new Date()) {
  const [playerCount, openPools, house, openInquiries, negativeBalances, lastSyncAt, postponedCount] =
    await Promise.all([
      prisma.user.count({ where: { role: 'PLAYER' } }),
      prisma.game.aggregate({
        where: { status: { in: ['SCHEDULED', 'LIVE', 'FINAL'] }, pool: { gt: 0 } },
        _sum: { pool: true },
        _count: true,
      }),
      prisma.game.aggregate({ where: { status: 'SETTLED' }, _sum: { houseTake: true } }),
      prisma.inquiry.count({ where: { status: 'OPEN' } }),
      prisma.user.findMany({
        where: { balance: { lt: 0 } },
        select: { id: true, username: true, balance: true },
        orderBy: { balance: 'asc' },
      }),
      getLastSyncAt(),
      prisma.game.count({ where: { status: 'POSTPONED' } }),
    ])
  return {
    playerCount,
    openPoolCount: openPools._count,
    openPoolTotal: openPools._sum.pool ?? 0,
    houseTakeTotal: house._sum.houseTake ?? 0,
    openInquiries,
    negativeBalances,
    lastSyncAt,
    syncStale: !lastSyncAt || now.getTime() - lastSyncAt.getTime() > SYNC_STALE_MS,
    postponedCount,
  }
}

export function searchPlayers(q?: string) {
  const key = q?.trim().toLowerCase()
  return prisma.user.findMany({
    where: { role: 'PLAYER', ...(key ? { usernameKey: { contains: key } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export function getPlayerDetail(id: string) {
  return prisma.user.findFirst({
    where: { id, role: 'PLAYER' },
    include: {
      referredBy: { select: { id: true, username: true } },
      referrals: { select: { id: true, username: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      bets: { include: { game: true }, orderBy: { createdAt: 'desc' }, take: 50 },
      transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
}

export function listGamesAdmin(status?: GameStatus) {
  return prisma.game.findMany({
    where: status ? { status } : {},
    orderBy: { startsAt: 'desc' },
    take: 200,
    include: { _count: { select: { bets: { where: { result: 'WON' } } } } },
  })
}

export function listTransactionsAdmin(f: { username?: string; type?: TransactionType; from?: Date; to?: Date }) {
  const username = f.username?.trim().toLowerCase()
  return prisma.transaction.findMany({
    where: {
      ...(username ? { user: { usernameKey: username } } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
}

export function listAdminActions() {
  return prisma.adminAction.findMany({
    include: { admin: { select: { username: true } }, targetUser: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin player management and admin queries"
```

---

### Task 10: Inquiry tickets

**Files:**
- Create: `src/server/inquiries.ts`
- Test: `tests/integration/inquiries.test.ts`

**Interfaces:**
- Consumes: `prisma`, `DomainError`
- Produces:
  - `createInquiry(userId: string, input: unknown): Promise<Inquiry>` (input `{ subject, body }`)
  - `replyToInquiry(actorId: string, inquiryId: string, input: unknown): Promise<void>` (input `{ body }`)
  - `closeInquiry(actorId: string, inquiryId: string): Promise<void>`
  - `getInquiryThread(viewerId: string, inquiryId: string)` → inquiry with `user.username` and `messages[]` (each with `author.username`, `author.role`), ascending
  - `listInquiriesForUser(userId: string)`, `listInquiriesAdmin(status?: InquiryStatus)` (includes `user.username`, `_count.messages`)

- [ ] **Step 1: Write failing tests**

`tests/integration/inquiries.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import {
  closeInquiry,
  createInquiry,
  getInquiryThread,
  listInquiriesAdmin,
  replyToInquiry,
} from '@/server/inquiries'
import { makeUser, resetDb } from '../helpers/db'

describe('inquiries', () => {
  beforeEach(resetDb)

  it('runs the OPEN → ANSWERED → OPEN → CLOSED flow', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    const inq = await createInquiry(p.id, { subject: 'Missing points', body: 'Where are my points?' })
    expect(inq.status).toBe('OPEN')

    await replyToInquiry(admin.id, inq.id, { body: 'Checking.' })
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inq.id } })).status).toBe('ANSWERED')

    await replyToInquiry(p.id, inq.id, { body: 'Thanks' })
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inq.id } })).status).toBe('OPEN')

    await closeInquiry(p.id, inq.id)
    const thread = await getInquiryThread(p.id, inq.id)
    expect(thread.status).toBe('CLOSED')
    expect(thread.messages.map((m) => m.body)).toEqual(['Where are my points?', 'Checking.', 'Thanks'])
    expect(thread.messages[1].author.role).toBe('ADMIN')
  })

  it('rejects replies to closed inquiries', async () => {
    const p = await makeUser()
    const inq = await createInquiry(p.id, { subject: 's', body: 'b' })
    await closeInquiry(p.id, inq.id)
    await expect(replyToInquiry(p.id, inq.id, { body: 'hello?' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('validates subject and body', async () => {
    const p = await makeUser()
    await expect(createInquiry(p.id, { subject: ' ', body: 'b' })).rejects.toBeInstanceOf(ZodError)
    await expect(createInquiry(p.id, { subject: 's', body: '' })).rejects.toBeInstanceOf(ZodError)
  })

  // Review Focus #5
  it('hides other players inquiries', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const inq = await createInquiry(owner.id, { subject: 's', body: 'b' })
    await expect(getInquiryThread(other.id, inq.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(replyToInquiry(other.id, inq.id, { body: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(closeInquiry(other.id, inq.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lists inquiries for admins by status', async () => {
    const p = await makeUser({ username: 'kyle' })
    await createInquiry(p.id, { subject: 'a', body: 'b' })
    const closed = await createInquiry(p.id, { subject: 'c', body: 'd' })
    await closeInquiry(p.id, closed.id)
    const open = await listInquiriesAdmin('OPEN')
    expect(open.map((i) => i.subject)).toEqual(['a'])
    expect(open[0].user.username).toBe('kyle')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/inquiries.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/server/inquiries.ts`:
```ts
import type { InquiryStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'

const subjectSchema = z.string({ required_error: 'Subject is required' }).trim().min(1, 'Subject is required').max(120)
const bodySchema = z.string({ required_error: 'Message is required' }).trim().min(1, 'Message is required').max(5000)

async function loadForActor(db: Tx, actorId: string, inquiryId: string) {
  const [actor, inquiry] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actorId } }),
    db.inquiry.findUnique({ where: { id: inquiryId } }),
  ])
  if (!inquiry || (actor.role !== 'ADMIN' && inquiry.userId !== actorId)) {
    throw new DomainError('NOT_FOUND', 'Inquiry not found')
  }
  return { actor, inquiry }
}

export async function createInquiry(userId: string, input: unknown) {
  const { subject, body } = z.object({ subject: subjectSchema, body: bodySchema }).parse(input)
  return prisma.inquiry.create({
    data: { userId, subject, messages: { create: { authorId: userId, body } } },
  })
}

export async function replyToInquiry(actorId: string, inquiryId: string, input: unknown): Promise<void> {
  const { body } = z.object({ body: bodySchema }).parse(input)
  await prisma.$transaction(async (tx) => {
    const { actor, inquiry } = await loadForActor(tx, actorId, inquiryId)
    if (inquiry.status === 'CLOSED') throw new DomainError('CONFLICT', 'This inquiry is closed')
    await tx.inquiryMessage.create({ data: { inquiryId, authorId: actorId, body } })
    await tx.inquiry.update({
      where: { id: inquiryId },
      data: { status: actor.role === 'ADMIN' ? 'ANSWERED' : 'OPEN' },
    })
  })
}

export async function closeInquiry(actorId: string, inquiryId: string): Promise<void> {
  const { inquiry } = await loadForActor(prisma, actorId, inquiryId)
  if (inquiry.status === 'CLOSED') return
  await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: 'CLOSED' } })
}

export async function getInquiryThread(viewerId: string, inquiryId: string) {
  await loadForActor(prisma, viewerId, inquiryId)
  return prisma.inquiry.findUniqueOrThrow({
    where: { id: inquiryId },
    include: {
      user: { select: { username: true } },
      messages: {
        include: { author: { select: { username: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

export function listInquiriesForUser(userId: string) {
  return prisma.inquiry.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
}

export function listInquiriesAdmin(status?: InquiryStatus) {
  return prisma.inquiry.findMany({
    where: status ? { status } : {},
    include: { user: { select: { username: true } }, _count: { select: { messages: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add threaded inquiry tickets"
```

---

### Task 11: Auth wiring, shared UI pieces, login/signup, player shell

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/server/session.ts`, `src/lib/action-state.ts`, `src/lib/format.ts`, `src/components/action-form.tsx`, `src/components/nav.tsx`, `src/app/(auth)/actions.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(player)/layout.tsx`, `src/app/(player)/games/page.tsx` (placeholder list, completed in Task 12)
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Test: `tests/unit/action-state.test.ts`

**Interfaces:**
- Consumes: `verifyCredentials`, `registerPlayer`, `isSuspended`, `DomainError`, `prisma`
- Produces:
  - `auth`, `signIn`, `signOut`, `handlers` from `@/auth`
  - `getCurrentUser(): Promise<User | null>`, `requireUser(): Promise<User>` (redirects to `/login`), `requireAdmin(): Promise<User>` (redirects to `/`)
  - `type ActionState = { error?: string; ok?: string }`, `runAction<T>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<ActionState>`
  - `<ActionForm action submitLabel className? resetOnSuccess?>` client component
  - `<Nav links user />` component
  - `formatTipoff(d: Date)`, `formatDateTime(d: Date)`, `formatPoints(n: number)`
  - CSS classes `btn`, `btn-secondary`, `input`, `card`, `table`, `label`

- [ ] **Step 1: Write the failing test for runAction**

`tests/unit/action-state.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runAction } from '@/lib/action-state'
import { DomainError } from '@/lib/errors'

describe('runAction', () => {
  it('returns ok on success', async () => {
    expect(await runAction(async () => 3, (n) => `got ${n}`)).toEqual({ ok: 'got 3' })
    expect(await runAction(async () => 3)).toEqual({ ok: 'Done' })
  })
  it('maps DomainError to its message', async () => {
    expect(
      await runAction(async () => {
        throw new DomainError('BETTING_CLOSED', 'Betting closed')
      }),
    ).toEqual({ error: 'Betting closed' })
  })
  it('maps ZodError to its first issue', async () => {
    expect(await runAction(async () => z.string().min(3, 'Too short').parse('a'))).toEqual({ error: 'Too short' })
  })
  it('rethrows unknown errors', async () => {
    await expect(
      runAction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
```

Run: `npx vitest run tests/unit/action-state.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement action-state and format helpers**

`src/lib/action-state.ts`:
```ts
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
```

`src/lib/format.ts`:
```ts
const ET = 'America/New_York'

export function formatTipoff(d: Date): string {
  return (
    d.toLocaleString('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) +
    ' ET'
  )
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', { timeZone: ET, dateStyle: 'medium', timeStyle: 'short' }) + ' ET'
}

export function formatPoints(n: number): string {
  return n.toLocaleString('en-US')
}
```

Run: `npx vitest run tests/unit/action-state.test.ts`
Expected: PASS.

- [ ] **Step 3: Auth.js config and session guards**

`src/auth.ts`:
```ts
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifyCredentials } from '@/server/users'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(creds) {
        const user = await verifyCredentials(String(creds?.username ?? ''), String(creds?.password ?? ''))
        if (!user) throw new CredentialsSignin()
        return { id: user.id, name: user.username }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id
      return token
    },
    session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid
      return session
    },
  },
})
```

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

`src/server/session.ts`:
```ts
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { isSuspended } from '@/lib/suspension'

/** Loads the user fresh from the DB on every request, so suspensions apply immediately. */
export async function getCurrentUser() {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || isSuspended(user)) return null
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/')
  return user
}
```

- [ ] **Step 4: Global styles and root layout**

Replace `src/app/globals.css`:
```css
@import "tailwindcss";

body {
  @apply bg-gray-50 text-gray-900 antialiased;
}

@layer components {
  .btn { @apply inline-flex items-center rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50; }
  .btn-secondary { @apply inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50; }
  .input { @apply w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm; }
  .label { @apply mb-1 block text-sm font-medium text-gray-700; }
  .card { @apply rounded-lg border border-gray-200 bg-white p-4; }
  .table { @apply w-full text-left text-sm; }
  .table th { @apply border-b border-gray-200 px-2 py-1.5 font-medium text-gray-600; }
  .table td { @apply border-b border-gray-100 px-2 py-1.5; }
}
```

Replace `src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LastDigit',
  description: 'Bet points on the last digit of NBA final scores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

Replace `src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/server/session'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(user.role === 'ADMIN' ? '/admin' : '/games')
}
```

- [ ] **Step 5: Shared components**

`src/components/action-form.tsx`:
```tsx
'use client'

import { useActionState, useEffect, useRef } from 'react'
import type { ActionState } from '@/lib/action-state'

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children?: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
}

export function ActionForm({ action, submitLabel, children, className, resetOnSuccess }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form ref={ref} action={formAction} className={className ?? 'space-y-3'}>
      {children}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Working…' : submitLabel}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  )
}
```

`src/components/nav.tsx`:
```tsx
import Link from 'next/link'
import { logoutAction } from '@/app/(auth)/actions'
import { formatPoints } from '@/lib/format'

export function Nav({
  links,
  user,
}: {
  links: { href: string; label: string }[]
  user: { username: string; balance: number }
}) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-orange-600">
          LastDigit
        </Link>
        <nav className="flex flex-wrap gap-3 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-orange-600">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span>
            {user.username} · <strong>{formatPoints(user.balance)}</strong> pts
          </span>
          <form action={logoutAction}>
            <button className="btn-secondary">Log out</button>
          </form>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Auth actions and pages**

`src/app/(auth)/actions.ts`:
```ts
'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { runAction, type ActionState } from '@/lib/action-state'
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

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const username = String(fd.get('username') ?? '')
  const password = String(fd.get('password') ?? '')
  const result = await runAction(() =>
    registerPlayer({ username, password, referralCode: String(fd.get('referralCode') ?? '') }),
  )
  if (result.error) return result
  try {
    await signIn('credentials', { username, password, redirectTo: '/' })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Account created, but automatic login failed. Please log in.' }
    throw e
  }
  return {}
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' })
}
```

`src/app/(auth)/login/page.tsx`:
```tsx
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { loginAction } from '../actions'

export default function LoginPage() {
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-bold text-orange-600">LastDigit</h1>
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Log in</h2>
        <ActionForm action={loginAction} submitLabel="Log in">
          <div>
            <label htmlFor="username" className="label">Username</label>
            <input id="username" name="username" className="input" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
        </ActionForm>
      </div>
      <p className="mt-4 text-sm">
        No account? <Link href="/signup" className="text-orange-600 underline">Sign up</Link>
      </p>
    </main>
  )
}
```

`src/app/(auth)/signup/page.tsx`:
```tsx
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { signupAction } from '../actions'

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-bold text-orange-600">LastDigit</h1>
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Sign up</h2>
        <ActionForm action={signupAction} submitLabel="Sign up">
          <div>
            <label htmlFor="username" className="label">Username</label>
            <input id="username" name="username" className="input" autoComplete="username" required />
            <p className="mt-1 text-xs text-gray-500">3–20 letters, numbers or underscores</p>
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={8} />
          </div>
          <div>
            <label htmlFor="referralCode" className="label">Referral code (optional)</label>
            <input id="referralCode" name="referralCode" className="input" defaultValue={ref ?? ''} />
          </div>
        </ActionForm>
      </div>
      <p className="mt-4 text-sm">
        Already have an account? <Link href="/login" className="text-orange-600 underline">Log in</Link>
      </p>
    </main>
  )
}
```

- [ ] **Step 7: Player shell**

`src/app/(player)/layout.tsx`:
```tsx
import { Nav } from '@/components/nav'
import { requireUser } from '@/server/session'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const links = [
    { href: '/games', label: 'Games' },
    { href: '/bets', label: 'My bets' },
    { href: '/wallet', label: 'Wallet' },
    { href: '/referral', label: 'Referral' },
    { href: '/inquiries', label: 'Inquiries' },
    ...(user.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
  ]
  return (
    <>
      <Nav links={links} user={user} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  )
}
```

`src/app/(player)/games/page.tsx` (temporary; replaced in Task 12):
```tsx
export default function GamesPage() {
  return <h1 className="text-xl font-semibold">Games</h1>
}
```

- [ ] **Step 8: Verify build and manual login**

Run: `npm test && npm run build`
Expected: tests pass, build succeeds.

Run: `npx prisma migrate dev` (applies migrations to the dev DB if not yet), then `npm run dev`, open http://localhost:3000 → redirected to `/login`; go to `/signup`, create `kyle1` / `secret123` → lands on `/games` showing the nav with `kyle1 · 0 pts`; click Log out → back to `/login`; log in again works; wrong password shows the error message.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add auth, session guards, login/signup and player shell"
```

---

### Task 12: Player pages

**Files:**
- Create: `src/server/queries/player.ts`, `src/components/countdown.tsx`, `src/components/bet-grid.tsx`, `src/components/inquiry-thread.tsx`, `src/app/(player)/actions.ts`, `src/app/(player)/games/[id]/page.tsx`, `src/app/(player)/bets/page.tsx`, `src/app/(player)/wallet/page.tsx`, `src/app/(player)/referral/page.tsx`, `src/app/(player)/inquiries/page.tsx`, `src/app/(player)/inquiries/[id]/page.tsx`
- Modify: `src/app/(player)/games/page.tsx`
- Test: `tests/integration/player-queries.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `runAction`, `ActionForm`, `placeBet`, `createInquiry`, `replyToInquiry`, `closeInquiry`, `getInquiryThread`, `listInquiriesForUser`, `formatEnding`, format helpers
- Produces:
  - `listUpcomingGames(now?: Date)`, `getGameForPlayer(gameId: string, userId: string)` → `{ game, myBets, winners } | null`, `listMyBets(userId: string, result?: BetResult)`, `listMyTransactions(userId: string)`, `listMyReferrals(userId: string)`
  - `<InquiryThread thread />` (reused by admin in Task 13)
  - Server actions: `placeBetAction(gameId)`, `createInquiryAction`, `replyInquiryAction(inquiryId)`, `closeInquiryAction(inquiryId)`

- [ ] **Step 1: Write the failing query test**

`tests/integration/player-queries.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { placeBet } from '@/server/bets'
import { getGameForPlayer, listUpcomingGames } from '@/server/queries/player'
import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('player queries', () => {
  beforeEach(resetDb)

  it('lists games from the last 36 hours onward, soonest first', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    await makeGame({ startsAt: new Date('2026-11-09T00:00:00Z') }) // too old
    const later = await makeGame({ startsAt: new Date('2026-11-12T00:00:00Z') })
    const recent = await makeGame({ startsAt: new Date('2026-11-11T00:00:00Z') })
    expect((await listUpcomingGames(now)).map((g) => g.id)).toEqual([recent.id, later.id])
  })

  it('returns only the viewer bets for a game', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(me.id, 100)
    await fundUser(other.id, 100)
    const g = await makeGame()
    await placeBet(me.id, { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 10 })
    await placeBet(other.id, { gameId: g.id, awayDigit: 3, homeDigit: 4, stake: 10 })
    const data = await getGameForPlayer(g.id, me.id)
    expect(data?.myBets.map((b) => [b.awayDigit, b.homeDigit])).toEqual([[1, 2]])
    expect(await getGameForPlayer('missing', me.id)).toBeNull()
  })
})
```

Run: `npx vitest run tests/integration/player-queries.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement player queries**

`src/server/queries/player.ts`:
```ts
import type { BetResult } from '@prisma/client'
import { prisma } from '@/lib/db'

export function listUpcomingGames(now: Date = new Date()) {
  return prisma.game.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - 36 * 3600_000) } },
    orderBy: { startsAt: 'asc' },
    take: 100,
  })
}

export async function getGameForPlayer(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return null
  const [myBets, winners] = await Promise.all([
    prisma.bet.findMany({ where: { gameId, userId }, orderBy: [{ awayDigit: 'asc' }, { homeDigit: 'asc' }] }),
    prisma.bet.count({ where: { gameId, result: 'WON' } }),
  ])
  return { game, myBets, winners }
}

export function listMyBets(userId: string, result?: BetResult) {
  return prisma.bet.findMany({
    where: { userId, ...(result ? { result } : {}) },
    include: { game: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export function listMyTransactions(userId: string) {
  return prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 })
}

export function listMyReferrals(userId: string) {
  return prisma.user.findMany({
    where: { referredById: userId },
    select: { username: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}
```

Run: `npx vitest run tests/integration/player-queries.test.ts`
Expected: PASS.

- [ ] **Step 3: Player server actions**

`src/app/(player)/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { runAction, type ActionState } from '@/lib/action-state'
import { placeBet } from '@/server/bets'
import { closeInquiry, createInquiry, replyToInquiry } from '@/server/inquiries'
import { requireUser } from '@/server/session'

export async function placeBetAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(
    () =>
      placeBet(user.id, {
        gameId,
        awayDigit: fd.get('awayDigit'),
        homeDigit: fd.get('homeDigit'),
        stake: fd.get('stake'),
      }),
    'Bet placed',
  )
  revalidatePath(`/games/${gameId}`)
  return result
}

export async function createInquiryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  let id: string | undefined
  const result = await runAction(async () => {
    id = (await createInquiry(user.id, { subject: fd.get('subject'), body: fd.get('body') })).id
  })
  if (id) redirect(`/inquiries/${id}`)
  return result
}

export async function replyInquiryAction(inquiryId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(() => replyToInquiry(user.id, inquiryId, { body: fd.get('body') }), 'Reply sent')
  revalidatePath(`/inquiries/${inquiryId}`)
  return result
}

export async function closeInquiryAction(inquiryId: string): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(() => closeInquiry(user.id, inquiryId), 'Inquiry closed')
  revalidatePath(`/inquiries/${inquiryId}`)
  return result
}
```

- [ ] **Step 4: Client components**

`src/components/countdown.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(to).getTime() - now
  if (ms <= 0) return <span>Betting closed</span>
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return (
    <span suppressHydrationWarning>
      Closes in {h}h {m}m {s % 60}s
    </span>
  )
}
```

`src/components/bet-grid.tsx`:
```tsx
'use client'

import { useActionState, useState } from 'react'
import type { ActionState } from '@/lib/action-state'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  open: boolean
  awayTeam: string
  homeTeam: string
  myStakes: Record<string, number>
  winning?: string
}

export function BetGrid({ action, open, awayTeam, homeTeam, myStakes, winning }: Props) {
  const [sel, setSel] = useState<{ a: number; h: number } | null>(null)
  const [state, formAction, pending] = useActionState(action, {})

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left text-gray-500">
                {awayTeam} ↓ / {homeTeam} →
              </th>
              {DIGITS.map((h) => (
                <th key={h} className="w-9 p-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIGITS.map((a) => (
              <tr key={a}>
                <th className="p-1">{a}</th>
                {DIGITS.map((h) => {
                  const key = `${a}-${h}`
                  const mine = myStakes[key]
                  const active = sel?.a === a && sel?.h === h
                  const win = winning === key
                  const color = active
                    ? 'bg-orange-600 text-white'
                    : win
                      ? 'bg-green-500 text-white'
                      : mine
                        ? 'bg-orange-100'
                        : 'bg-white'
                  return (
                    <td key={h} className="p-0.5">
                      <button
                        type="button"
                        disabled={!open}
                        onClick={() => setSel({ a, h })}
                        aria-label={`Ending ${key}`}
                        aria-pressed={active}
                        className={`h-9 w-9 rounded border border-gray-200 text-[10px] ${color} disabled:cursor-not-allowed`}
                      >
                        {mine ?? key}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-500">Rows: {awayTeam} last digit. Columns: {homeTeam} last digit. Numbers show your stake.</p>

      {open && (
        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="awayDigit" value={sel?.a ?? ''} />
          <input type="hidden" name="homeDigit" value={sel?.h ?? ''} />
          <div>
            <span className="label">Ending</span>
            <div className="font-mono text-lg">{sel ? `${sel.a}-${sel.h}` : '—'}</div>
          </div>
          <div>
            <label htmlFor="stake" className="label">Stake</label>
            <input id="stake" name="stake" type="number" min={1} step={1} required className="input w-32" />
          </div>
          <button className="btn" disabled={!sel || pending}>
            {pending ? 'Placing…' : 'Place bet'}
          </button>
        </form>
      )}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-green-700">{state.ok}</p>}
    </div>
  )
}
```

`src/components/inquiry-thread.tsx`:
```tsx
import { formatDateTime } from '@/lib/format'

type Thread = {
  subject: string
  status: string
  messages: { id: string; body: string; createdAt: Date; author: { username: string; role: string } }[]
}

export function InquiryThread({ thread }: { thread: Thread }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{thread.subject}</h1>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{thread.status}</span>
      </div>
      {thread.messages.map((m) => (
        <div key={m.id} className={`card ${m.author.role === 'ADMIN' ? 'border-orange-200 bg-orange-50' : ''}`}>
          <div className="mb-1 text-xs text-gray-500">
            {m.author.role === 'ADMIN' ? 'Support' : m.author.username} · {formatDateTime(m.createdAt)}
          </div>
          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Games list and game detail**

Replace `src/app/(player)/games/page.tsx`:
```tsx
import Link from 'next/link'
import { Countdown } from '@/components/countdown'
import { formatPoints, formatTipoff } from '@/lib/format'
import { listUpcomingGames } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function GamesPage() {
  await requireUser()
  const games = await listUpcomingGames()
  const now = new Date()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Games</h1>
      {games.length === 0 && <p className="text-gray-500">No games scheduled right now.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {games.map((g) => {
          const open = g.status === 'SCHEDULED' && g.startsAt > now
          return (
            <li key={g.id}>
              <Link href={`/games/${g.id}`} className="card block hover:border-orange-400">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {g.awayTeam} @ {g.homeTeam}
                  </span>
                  <span className="text-xs text-gray-500">{g.status}</span>
                </div>
                <div className="mt-1 text-sm text-gray-600">{formatTipoff(g.startsAt)}</div>
                {g.awayScore !== null && g.homeScore !== null && (
                  <div className="mt-1 font-mono">
                    {g.awayScore} – {g.homeScore}
                  </div>
                )}
                <div className="mt-2 flex justify-between text-sm">
                  <span>Pool: {formatPoints(g.pool)}</span>
                  {open && <Countdown to={g.startsAt.toISOString()} />}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

`src/app/(player)/games/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { BetGrid } from '@/components/bet-grid'
import { Countdown } from '@/components/countdown'
import { endingOf, formatEnding } from '@/lib/game/ending'
import { formatPoints, formatTipoff } from '@/lib/format'
import { getGameForPlayer } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { placeBetAction } from '../../actions'

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const data = await getGameForPlayer(id, user.id)
  if (!data) notFound()
  const { game, myBets, winners } = data

  const open = game.status === 'SCHEDULED' && game.startsAt > new Date()
  const hasFinal = (game.status === 'FINAL' || game.status === 'SETTLED') && game.awayScore !== null && game.homeScore !== null
  const winning = hasFinal ? formatEnding(endingOf(game.awayScore!, game.homeScore!)) : undefined
  const myStakes = Object.fromEntries(myBets.map((b) => [`${b.awayDigit}-${b.homeDigit}`, b.stake]))

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">
          {game.awayTeam} @ {game.homeTeam}
        </h1>
        <p className="text-sm text-gray-600">
          {formatTipoff(game.startsAt)} · {game.status} · Pool {formatPoints(game.pool)}
        </p>
        {game.awayScore !== null && game.homeScore !== null && (
          <p className="mt-2 font-mono text-2xl">
            {game.awayScore} – {game.homeScore}
          </p>
        )}
        {winning && (
          <p className="mt-1 text-sm">
            Winning ending: <strong className="font-mono">{winning}</strong>
            {game.status === 'SETTLED' && ` · ${winners} winning bet${winners === 1 ? '' : 's'}`}
          </p>
        )}
        {game.status === 'VOID' && <p className="mt-1 text-sm text-red-600">Void: {game.voidReason}. Stakes were refunded.</p>}
        {open && (
          <p className="mt-1 text-sm text-orange-700">
            <Countdown to={game.startsAt.toISOString()} />
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">{open ? 'Place bet' : 'Endings'}</h2>
        <BetGrid
          action={placeBetAction.bind(null, game.id)}
          open={open}
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          myStakes={myStakes}
          winning={winning}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">My bets on this game</h2>
        {myBets.length === 0 ? (
          <p className="text-sm text-gray-500">No bets yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Ending</th><th>Stake</th><th>Result</th><th>Payout</th></tr>
            </thead>
            <tbody>
              {myBets.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono">{b.awayDigit}-{b.homeDigit}</td>
                  <td>{formatPoints(b.stake)}</td>
                  <td>{b.result}</td>
                  <td>{formatPoints(b.payout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: My bets, wallet, referral**

`src/app/(player)/bets/page.tsx`:
```tsx
import type { BetResult } from '@prisma/client'
import Link from 'next/link'
import { formatPoints, formatTipoff } from '@/lib/format'
import { listMyBets } from '@/server/queries/player'
import { requireUser } from '@/server/session'

const FILTERS: (BetResult | 'ALL')[] = ['ALL', 'PENDING', 'WON', 'LOST', 'REFUNDED']

export default async function BetsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const user = await requireUser()
  const { result } = await searchParams
  const filter = FILTERS.includes(result as BetResult) && result !== 'ALL' ? (result as BetResult) : undefined
  const bets = await listMyBets(user.id, filter)
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">My bets</h1>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'ALL' ? '/bets' : `/bets?result=${f}`}
            className={(filter ?? 'ALL') === f ? 'btn' : 'btn-secondary'}
          >
            {f}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Game</th><th>Tip-off</th><th>Ending</th><th>Stake</th><th>Result</th><th>Payout</th></tr>
          </thead>
          <tbody>
            {bets.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/games/${b.gameId}`} className="underline">{b.game.awayTeam} @ {b.game.homeTeam}</Link></td>
                <td>{formatTipoff(b.game.startsAt)}</td>
                <td className="font-mono">{b.awayDigit}-{b.homeDigit}</td>
                <td>{formatPoints(b.stake)}</td>
                <td>{b.result}</td>
                <td>{formatPoints(b.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bets.length === 0 && <p className="p-2 text-sm text-gray-500">No bets.</p>}
      </div>
    </div>
  )
}
```

`src/app/(player)/wallet/page.tsx`:
```tsx
import { formatDateTime, formatPoints } from '@/lib/format'
import { listMyTransactions } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function WalletPage() {
  const user = await requireUser()
  const txs = await listMyTransactions(user.id)
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-sm text-gray-600">Balance</div>
        <div className="text-3xl font-bold" data-testid="balance">{formatPoints(user.balance)} pts</div>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">History</h2>
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th></tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>{t.type}</td>
                <td className={t.amount < 0 ? 'text-red-600' : 'text-green-700'}>
                  {t.amount > 0 ? '+' : ''}{formatPoints(t.amount)}
                </td>
                <td>{formatPoints(t.balanceAfter)}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 && <p className="p-2 text-sm text-gray-500">No transactions yet.</p>}
      </div>
    </div>
  )
}
```

`src/app/(player)/referral/page.tsx`:
```tsx
import { headers } from 'next/headers'
import { formatDateTime, formatPoints } from '@/lib/format'
import { listMyReferrals } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { getReferralBonus } from '@/server/settings'

export default async function ReferralPage() {
  const user = await requireUser()
  const [referrals, bonus, h] = await Promise.all([listMyReferrals(user.id), getReferralBonus(), headers()])
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const link = `${origin}/signup?ref=${user.referralCode}`
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h1 className="text-xl font-semibold">Refer friends</h1>
        <p className="text-sm">Earn {formatPoints(bonus)} points for each friend who signs up with your code.</p>
        <p>Your code: <strong className="font-mono" data-testid="referral-code">{user.referralCode}</strong></p>
        <p className="break-all text-sm">Share link: <span className="font-mono">{link}</span></p>
      </div>
      <div className="card">
        <h2 className="mb-2 font-semibold">Referred players ({referrals.length})</h2>
        <ul className="text-sm">
          {referrals.map((r) => (
            <li key={r.username}>{r.username} · {formatDateTime(r.createdAt)}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Inquiry pages**

`src/app/(player)/inquiries/page.tsx`:
```tsx
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { formatDateTime } from '@/lib/format'
import { listInquiriesForUser } from '@/server/inquiries'
import { requireUser } from '@/server/session'
import { createInquiryAction } from '../actions'

export default async function InquiriesPage() {
  const user = await requireUser()
  const inquiries = await listInquiriesForUser(user.id)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h1 className="mb-3 text-xl font-semibold">My inquiries</h1>
        <ul className="divide-y text-sm">
          {inquiries.map((i) => (
            <li key={i.id} className="py-2">
              <Link href={`/inquiries/${i.id}`} className="underline">{i.subject}</Link>
              <span className="ml-2 text-xs text-gray-500">{i.status} · {formatDateTime(i.updatedAt)}</span>
            </li>
          ))}
        </ul>
        {inquiries.length === 0 && <p className="text-sm text-gray-500">No inquiries yet.</p>}
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">New inquiry</h2>
        <ActionForm action={createInquiryAction} submitLabel="Send">
          <div>
            <label htmlFor="subject" className="label">Subject</label>
            <input id="subject" name="subject" className="input" maxLength={120} required />
          </div>
          <div>
            <label htmlFor="body" className="label">Message</label>
            <textarea id="body" name="body" className="input" rows={5} maxLength={5000} required />
          </div>
        </ActionForm>
      </div>
    </div>
  )
}
```

`src/app/(player)/inquiries/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { InquiryThread } from '@/components/inquiry-thread'
import { DomainError } from '@/lib/errors'
import { getInquiryThread } from '@/server/inquiries'
import { requireUser } from '@/server/session'
import { closeInquiryAction, replyInquiryAction } from '../../actions'

export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const thread = await getInquiryThread(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound()
    throw e
  })
  return (
    <div className="space-y-4">
      <InquiryThread thread={thread} />
      {thread.status !== 'CLOSED' && (
        <div className="card space-y-4">
          <ActionForm action={replyInquiryAction.bind(null, id)} submitLabel="Reply" resetOnSuccess>
            <label htmlFor="body" className="label">Reply</label>
            <textarea id="body" name="body" className="input" rows={4} maxLength={5000} required />
          </ActionForm>
          <ActionForm action={closeInquiryAction.bind(null, id)} submitLabel="Close inquiry" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: tests pass, build succeeds.

Manual check with `npm run dev`: insert a test game in the dev DB:
```bash
docker compose exec db psql -U postgres -d lastdigit -c "INSERT INTO \"Game\" (id, \"externalId\", \"startsAt\", \"awayTeam\", \"homeTeam\", status, pool, \"houseTake\", \"createdAt\", \"updatedAt\") VALUES ('devgame1', 1, now() + interval '2 hours', 'LAL', 'GSW', 'SCHEDULED', 0, 0, now(), now());"
```
Log in as a player, open `/games` → game listed with countdown; open it → 10×10 grid; placing a bet with 0 balance shows "Insufficient balance". Create an inquiry → redirected to its thread; reply works; close hides the reply form.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add player games, betting grid, bets, wallet, referral and inquiries pages"
```

---

### Task 13: Admin panel

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/actions.ts`, `src/app/admin/page.tsx`, `src/app/admin/players/page.tsx`, `src/app/admin/players/[id]/page.tsx`, `src/app/admin/games/page.tsx`, `src/app/admin/transactions/page.tsx`, `src/app/admin/inquiries/page.tsx`, `src/app/admin/inquiries/[id]/page.tsx`, `src/app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `runAction`, `ActionForm`, `Nav`, `InquiryThread`, all of Task 9's functions, `voidGame`, `syncGames`, `defaultFetcher`, `setReferralBonus`, `getReferralBonus`, `replyToInquiry`, `closeInquiry`, `getInquiryThread`, `listInquiriesAdmin`
- Produces: the `/admin/*` routes. Form field names used by E2E (Task 14) on the player detail page: select `direction` (label "Direction"), input `amount` (label "Amount"), input `note` (label "Note"), button "Apply points".

- [ ] **Step 1: Admin layout and actions**

`src/app/admin/layout.tsx`:
```tsx
import { Nav } from '@/components/nav'
import { requireAdmin } from '@/server/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const links = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/players', label: 'Players' },
    { href: '/admin/games', label: 'Games' },
    { href: '/admin/transactions', label: 'Transactions' },
    { href: '/admin/inquiries', label: 'Inquiries' },
    { href: '/admin/settings', label: 'Settings' },
    { href: '/games', label: 'Player site' },
  ]
  return (
    <>
      <Nav links={links} user={admin} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  )
}
```

`src/app/admin/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { runAction, type ActionState } from '@/lib/action-state'
import { adjustPoints, resetPassword, setStakeLimit, suspendPlayer, unsuspendPlayer } from '@/server/admin/players'
import { closeInquiry, replyToInquiry } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { setReferralBonus } from '@/server/settings'
import { voidGame } from '@/server/settlement'
import { defaultFetcher, syncGames } from '@/server/sync/sync'

export async function adjustPointsAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(
    () => adjustPoints(admin.id, userId, { direction: fd.get('direction'), amount: fd.get('amount'), note: fd.get('note') }),
    'Points updated',
  )
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function suspendAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('until') ?? '').trim()
  const until = v ? new Date(`${v}T00:00:00Z`) : null
  if (until && Number.isNaN(until.getTime())) return { error: 'Invalid date' }
  const r = await runAction(() => suspendPlayer(admin.id, userId, until), 'Player suspended')
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function unsuspendAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => unsuspendPlayer(admin.id, userId), 'Suspension lifted')
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function stakeLimitAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('limit') ?? '').trim()
  const r = await runAction(() => setStakeLimit(admin.id, userId, v === '' ? null : v), 'Stake limit saved')
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function resetPasswordAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  return runAction(() => resetPassword(admin.id, userId, fd.get('newPassword')), 'Password reset')
}

export async function voidGameAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => voidGame(admin.id, gameId, fd.get('reason')), 'Game voided')
  revalidatePath('/admin/games')
  return r
}

export async function forceSyncAction(): Promise<ActionState> {
  await requireAdmin()
  try {
    const r = await syncGames({ fetchGames: defaultFetcher() })
    revalidatePath('/admin/games')
    return { ok: `Sync complete: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped, ${r.settled} settled` }
  } catch (e) {
    return { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function adminReplyAction(inquiryId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => replyToInquiry(admin.id, inquiryId, { body: fd.get('body') }), 'Reply sent')
  revalidatePath(`/admin/inquiries/${inquiryId}`)
  return r
}

export async function adminCloseAction(inquiryId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => closeInquiry(admin.id, inquiryId), 'Inquiry closed')
  revalidatePath(`/admin/inquiries/${inquiryId}`)
  return r
}

export async function referralBonusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => setReferralBonus(admin.id, fd.get('referralBonus')), 'Referral bonus saved')
  revalidatePath('/admin/settings')
  return r
}
```

- [ ] **Step 2: Dashboard**

`src/app/admin/page.tsx`:
```tsx
import Link from 'next/link'
import { formatDateTime, formatPoints } from '@/lib/format'
import { getDashboardStats } from '@/server/admin/queries'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

export default async function AdminDashboard() {
  const s = await getDashboardStats()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {s.syncStale && (
        <p role="alert" className="card border-red-300 bg-red-50 text-sm text-red-700">
          Game sync is stale. Last successful sync: {s.lastSyncAt ? formatDateTime(s.lastSyncAt) : 'never'}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Players" value={s.playerCount} />
        <Stat label={`Open pools (${s.openPoolCount})`} value={formatPoints(s.openPoolTotal)} />
        <Stat label="House take" value={formatPoints(s.houseTakeTotal)} />
        <Stat label="Open inquiries" value={s.openInquiries} />
      </div>
      {s.postponedCount > 0 && (
        <p className="card text-sm">
          {s.postponedCount} postponed game(s) need review. <Link href="/admin/games?status=POSTPONED" className="underline">Review</Link>
        </p>
      )}
      <div className="card">
        <h2 className="mb-2 font-semibold">Negative balances</h2>
        {s.negativeBalances.length === 0 ? (
          <p className="text-sm text-gray-500">None.</p>
        ) : (
          <ul className="text-sm">
            {s.negativeBalances.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/players/${u.id}`} className="underline">{u.username}</Link>: {formatPoints(u.balance)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Players list and detail**

`src/app/admin/players/page.tsx`:
```tsx
import Link from 'next/link'
import { formatDateTime, formatPoints } from '@/lib/format'
import { isSuspended } from '@/lib/suspension'
import { searchPlayers } from '@/server/admin/queries'

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const players = await searchPlayers(q)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Players</h1>
      <form className="flex gap-2">
        <label htmlFor="q" className="sr-only">Search username</label>
        <input id="q" name="q" defaultValue={q ?? ''} placeholder="Search username" className="input max-w-xs" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Username</th><th>Balance</th><th>Status</th><th>Stake limit</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/players/${p.id}`} className="underline">{p.username}</Link></td>
                <td className={p.balance < 0 ? 'text-red-600' : ''}>{formatPoints(p.balance)}</td>
                <td>{isSuspended(p) ? 'SUSPENDED' : 'ACTIVE'}</td>
                <td>{p.stakeLimitPerGame ?? '—'}</td>
                <td>{formatDateTime(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {players.length === 0 && <p className="p-2 text-sm text-gray-500">No players found.</p>}
      </div>
    </div>
  )
}
```

`src/app/admin/players/[id]/page.tsx`:
```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { formatDateTime, formatPoints } from '@/lib/format'
import { isSuspended } from '@/lib/suspension'
import { getPlayerDetail } from '@/server/admin/queries'
import {
  adjustPointsAction,
  resetPasswordAction,
  stakeLimitAction,
  suspendAction,
  unsuspendAction,
} from '../../actions'

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await getPlayerDetail(id)
  if (!p) notFound()
  const suspended = isSuspended(p)

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">{p.username}</h1>
        <p className="text-sm text-gray-600">
          Balance <strong className={p.balance < 0 ? 'text-red-600' : ''}>{formatPoints(p.balance)}</strong> · Joined{' '}
          {formatDateTime(p.createdAt)} · Code <span className="font-mono">{p.referralCode}</span>
        </p>
        <p className="text-sm">
          Referred by:{' '}
          {p.referredBy ? <Link href={`/admin/players/${p.referredBy.id}`} className="underline">{p.referredBy.username}</Link> : '—'}
        </p>
        <p className="text-sm">
          Status: {suspended ? `SUSPENDED${p.suspendedUntil ? ` until ${formatDateTime(p.suspendedUntil)}` : ' (indefinite)'}` : 'ACTIVE'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">Points</h2>
          <ActionForm action={adjustPointsAction.bind(null, p.id)} submitLabel="Apply points" resetOnSuccess>
            <div>
              <label htmlFor="direction" className="label">Direction</label>
              <select id="direction" name="direction" className="input">
                <option value="GRANT">Grant</option>
                <option value="DEDUCT">Deduct</option>
              </select>
            </div>
            <div>
              <label htmlFor="amount" className="label">Amount</label>
              <input id="amount" name="amount" type="number" min={1} step={1} className="input" required />
            </div>
            <div>
              <label htmlFor="note" className="label">Note</label>
              <input id="note" name="note" className="input" maxLength={500} required />
            </div>
          </ActionForm>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">Restrictions</h2>
          {suspended ? (
            <ActionForm action={unsuspendAction.bind(null, p.id)} submitLabel="Lift suspension" />
          ) : (
            <ActionForm action={suspendAction.bind(null, p.id)} submitLabel="Suspend">
              <label htmlFor="until" className="label">Suspend until (UTC date, blank = indefinite)</label>
              <input id="until" name="until" type="date" className="input" />
            </ActionForm>
          )}
          <ActionForm action={stakeLimitAction.bind(null, p.id)} submitLabel="Save stake limit">
            <label htmlFor="limit" className="label">Stake limit per game (blank = none)</label>
            <input id="limit" name="limit" type="number" min={1} step={1} className="input" defaultValue={p.stakeLimitPerGame ?? ''} />
          </ActionForm>
          <ActionForm action={resetPasswordAction.bind(null, p.id)} submitLabel="Reset password" resetOnSuccess>
            <label htmlFor="newPassword" className="label">New password</label>
            <input id="newPassword" name="newPassword" type="text" minLength={8} className="input" required />
          </ActionForm>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Referred players ({p.referrals.length})</h2>
        <ul className="text-sm">
          {p.referrals.map((r) => (
            <li key={r.id}><Link href={`/admin/players/${r.id}`} className="underline">{r.username}</Link> · {formatDateTime(r.createdAt)}</li>
          ))}
        </ul>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Recent bets</h2>
        <table className="table">
          <thead><tr><th>Game</th><th>Ending</th><th>Stake</th><th>Result</th><th>Payout</th></tr></thead>
          <tbody>
            {p.bets.map((b) => (
              <tr key={b.id}>
                <td>{b.game.awayTeam} @ {b.game.homeTeam}</td>
                <td className="font-mono">{b.awayDigit}-{b.homeDigit}</td>
                <td>{formatPoints(b.stake)}</td>
                <td>{b.result}</td>
                <td>{formatPoints(b.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Recent transactions</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th></tr></thead>
          <tbody>
            {p.transactions.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>{t.type}</td>
                <td>{formatPoints(t.amount)}</td>
                <td>{formatPoints(t.balanceAfter)}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Games, transactions**

`src/app/admin/games/page.tsx`:
```tsx
import { GameStatus } from '@prisma/client'
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { formatPoints, formatTipoff } from '@/lib/format'
import { listGamesAdmin } from '@/server/admin/queries'
import { forceSyncAction, voidGameAction } from '../actions'

const STATUSES = Object.values(GameStatus)

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const filter = STATUSES.includes(status as GameStatus) ? (status as GameStatus) : undefined
  const games = await listGamesAdmin(filter)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Games</h1>
        <ActionForm action={forceSyncAction} submitLabel="Force sync" className="flex items-center gap-2" />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/games" className={!filter ? 'btn' : 'btn-secondary'}>ALL</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/games?status=${s}`} className={filter === s ? 'btn' : 'btn-secondary'}>{s}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Game</th><th>Tip-off</th><th>Status</th><th>Score</th><th>Pool</th><th>House</th><th>Winners</th><th>Void</th></tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id} className={g.status === 'POSTPONED' ? 'bg-yellow-50' : ''}>
                <td>{g.awayTeam} @ {g.homeTeam}</td>
                <td>{formatTipoff(g.startsAt)}</td>
                <td>{g.status}</td>
                <td className="font-mono">{g.awayScore ?? '–'}-{g.homeScore ?? '–'}</td>
                <td>{formatPoints(g.pool)}</td>
                <td>{formatPoints(g.houseTake)}</td>
                <td>{g._count.bets}</td>
                <td>
                  {g.status === 'VOID' ? (
                    <span className="text-xs text-gray-500">{g.voidReason}</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-xs text-red-600">Void…</summary>
                      <ActionForm action={voidGameAction.bind(null, g.id)} submitLabel="Void game" className="mt-2 space-y-2">
                        <label htmlFor={`reason-${g.id}`} className="label">Reason</label>
                        <input id={`reason-${g.id}`} name="reason" className="input" required />
                      </ActionForm>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {games.length === 0 && <p className="p-2 text-sm text-gray-500">No games.</p>}
      </div>
    </div>
  )
}
```

`src/app/admin/transactions/page.tsx`:
```tsx
import { TransactionType } from '@prisma/client'
import { formatDateTime, formatPoints } from '@/lib/format'
import { listTransactionsAdmin } from '@/server/admin/queries'

const TYPES = Object.values(TransactionType)

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string; type?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const type = TYPES.includes(sp.type as TransactionType) ? (sp.type as TransactionType) : undefined
  const to = parseDate(sp.to)
  const txs = await listTransactionsAdmin({
    username: sp.username,
    type,
    from: parseDate(sp.from),
    to: to ? new Date(to.getTime() + 86_400_000) : undefined, // inclusive end date
  })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>
      <form className="card grid gap-2 sm:grid-cols-5">
        <div>
          <label htmlFor="username" className="label">Username</label>
          <input id="username" name="username" defaultValue={sp.username ?? ''} className="input" />
        </div>
        <div>
          <label htmlFor="type" className="label">Type</label>
          <select id="type" name="type" defaultValue={type ?? ''} className="input">
            <option value="">All</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="label">From</label>
          <input id="from" name="from" type="date" defaultValue={sp.from ?? ''} className="input" />
        </div>
        <div>
          <label htmlFor="to" className="label">To</label>
          <input id="to" name="to" type="date" defaultValue={sp.to ?? ''} className="input" />
        </div>
        <div className="flex items-end"><button className="btn">Filter</button></div>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>User</th><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th></tr></thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{formatDateTime(t.createdAt)}</td>
                <td>{t.user.username}</td>
                <td>{t.type}</td>
                <td>{formatPoints(t.amount)}</td>
                <td>{formatPoints(t.balanceAfter)}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 && <p className="p-2 text-sm text-gray-500">No transactions.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Inquiries and settings**

`src/app/admin/inquiries/page.tsx`:
```tsx
import { InquiryStatus } from '@prisma/client'
import Link from 'next/link'
import { formatDateTime } from '@/lib/format'
import { listInquiriesAdmin } from '@/server/inquiries'

const STATUSES = Object.values(InquiryStatus)

export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const filter = STATUSES.includes(status as InquiryStatus) ? (status as InquiryStatus) : 'OPEN'
  const inquiries = await listInquiriesAdmin(filter)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inquiries</h1>
      <div className="flex gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/inquiries?status=${s}`} className={filter === s ? 'btn' : 'btn-secondary'}>{s}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Subject</th><th>Player</th><th>Messages</th><th>Updated</th></tr></thead>
          <tbody>
            {inquiries.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/admin/inquiries/${i.id}`} className="underline">{i.subject}</Link></td>
                <td>{i.user.username}</td>
                <td>{i._count.messages}</td>
                <td>{formatDateTime(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {inquiries.length === 0 && <p className="p-2 text-sm text-gray-500">Nothing here.</p>}
      </div>
    </div>
  )
}
```

`src/app/admin/inquiries/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { InquiryThread } from '@/components/inquiry-thread'
import { DomainError } from '@/lib/errors'
import { getInquiryThread } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { adminCloseAction, adminReplyAction } from '../../actions'

export default async function AdminInquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = await requireAdmin()
  const thread = await getInquiryThread(admin.id, id).catch((e) => {
    if (e instanceof DomainError) notFound()
    throw e
  })
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">From {thread.user.username}</p>
      <InquiryThread thread={thread} />
      {thread.status !== 'CLOSED' && (
        <div className="card space-y-4">
          <ActionForm action={adminReplyAction.bind(null, id)} submitLabel="Send reply" resetOnSuccess>
            <label htmlFor="body" className="label">Reply</label>
            <textarea id="body" name="body" className="input" rows={4} maxLength={5000} required />
          </ActionForm>
          <ActionForm action={adminCloseAction.bind(null, id)} submitLabel="Close inquiry" />
        </div>
      )}
    </div>
  )
}
```

`src/app/admin/settings/page.tsx`:
```tsx
import { ActionForm } from '@/components/action-form'
import { formatDateTime } from '@/lib/format'
import { listAdminActions } from '@/server/admin/queries'
import { getReferralBonus } from '@/server/settings'
import { referralBonusAction } from '../actions'

export default async function AdminSettingsPage() {
  const [bonus, actions] = await Promise.all([getReferralBonus(), listAdminActions()])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="card max-w-sm">
        <ActionForm action={referralBonusAction} submitLabel="Save">
          <label htmlFor="referralBonus" className="label">Referral bonus (points to referrer)</label>
          <input id="referralBonus" name="referralBonus" type="number" min={0} step={1} defaultValue={bonus} className="input" required />
        </ActionForm>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Admin action log</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Player</th><th>Details</th></tr></thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td>{formatDateTime(a.createdAt)}</td>
                <td>{a.admin.username}</td>
                <td>{a.action}</td>
                <td>{a.targetUser?.username ?? '—'}</td>
                <td className="font-mono text-xs">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: tests pass, build succeeds.

Manual check: promote your dev user to admin (`docker compose exec db psql -U postgres -d lastdigit -c "UPDATE \"User\" SET role='ADMIN' WHERE \"usernameKey\"='kyle1';"`), log in → lands on `/admin`. Grant points to a player with a note; suspend and lift; set a stake limit; void the dev game with a reason; check the action log on Settings; a player visiting `/admin` is redirected to `/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add admin dashboard, players, games, transactions, inquiries and settings"
```

---

### Task 14: Seed, end-to-end test, README

**Files:**
- Create: `prisma/seed.ts`, `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/full-flow.spec.ts`, `README.md`
- Modify: `package.json` (prisma seed config), `.gitignore` (Playwright output)

**Interfaces:**
- Consumes: `hashPassword`, `generateReferralCode`, `syncGames`, `ApiGame`, all UI labels from Tasks 11–13
- Produces: `npm run db:seed`, `npm run test:e2e`

- [ ] **Step 1: Seed script**

`prisma/seed.ts`:
```ts
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/server/passwords'
import { generateReferralCode } from '../src/server/referral-code'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!username || !password) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set')
  const passwordHash = await hashPassword(password)
  await prisma.user.upsert({
    where: { usernameKey: username.toLowerCase() },
    update: { passwordHash, role: 'ADMIN' },
    create: { username, usernameKey: username.toLowerCase(), passwordHash, role: 'ADMIN', referralCode: generateReferralCode() },
  })
  await prisma.setting.upsert({ where: { key: 'referralBonus' }, update: {}, create: { key: 'referralBonus', value: '500' } })
  console.log(`Seeded admin "${username}"`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

Add to `package.json` top level:
```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

Run: `npm run db:seed`
Expected: `Seeded admin "admin"`. Log in at `/login` as `admin` / `admin12345` → `/admin`.

- [ ] **Step 2: Playwright config**

Run: `npx playwright install chromium`

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100/login',
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      AUTH_SECRET: process.env.AUTH_SECRET!,
      AUTH_TRUST_HOST: 'true',
      CRON_SECRET: process.env.CRON_SECRET!,
      BALLDONTLIE_API_KEY: 'unused',
    },
  },
})
```

`e2e/global-setup.ts`:
```ts
import { execSync } from 'node:child_process'

export default function setup() {
  // Resets the test DB and runs prisma/seed.ts (admin from .env.test)
  execSync('npx prisma migrate reset --force', { stdio: 'inherit', env: process.env })
}
```

Append to `.gitignore`:
```
/test-results/
/playwright-report/
```

- [ ] **Step 3: Write the E2E test**

`e2e/full-flow.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'
import { prisma } from '../src/lib/db'
import type { ApiGame } from '../src/server/sync/balldontlie'
import { syncGames } from '../src/server/sync/sync'

async function signup(page: Page, username: string, ref?: string) {
  await page.goto(ref ? `/signup?ref=${ref}` : '/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL('**/games')
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL('**/login')
}

test('referral → admin grant → bet → auto-settle → payout', async ({ page }) => {
  // alice signs up and shares her code
  await signup(page, 'alice')
  await page.goto('/referral')
  const code = (await page.getByTestId('referral-code').textContent())!.trim()
  await logout(page)

  // bob signs up with alice's code; alice gets 500
  await signup(page, 'bob', code)
  await logout(page)
  const alice = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'alice' } })
  expect(alice.balance).toBe(500)

  // admin grants bob 1000
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto('/admin/players?q=bob')
  await page.getByRole('link', { name: 'bob' }).click()
  await page.getByLabel('Direction').selectOption('GRANT')
  await page.getByLabel('Amount').fill('1000')
  await page.getByLabel('Note').fill('Welcome bonus')
  await page.getByRole('button', { name: 'Apply points' }).click()
  await expect(page.getByText('Points updated')).toBeVisible()
  await logout(page)

  // a game exists; bob bets 100 on 9-6
  const game = await prisma.game.create({
    data: {
      externalId: 777,
      startsAt: new Date(Date.now() + 2 * 3600_000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    },
  })
  await login(page, 'bob', 'secret123')
  await page.waitForURL('**/games')
  await page.goto(`/games/${game.id}`)
  await page.getByRole('button', { name: 'Ending 9-6' }).click()
  await page.getByLabel('Stake').fill('100')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByText('Bet placed')).toBeVisible()

  // the API reports the game final: LAL 99 @ GSW 106 → ending 9-6
  const final: ApiGame = {
    id: 777,
    date: '2026-11-11',
    datetime: game.startsAt.toISOString(),
    status: 'Final',
    period: 4,
    home_team_score: 106,
    visitor_team_score: 99,
    home_team: { abbreviation: 'GSW' },
    visitor_team: { abbreviation: 'LAL' },
  }
  const result = await syncGames({ fetchGames: async () => [final] })
  expect(result.settled).toBe(1)

  // bob: 1000 - 100 + 90 (sole winner gets 90% of a 100 pool)
  await page.goto('/wallet')
  await expect(page.getByTestId('balance')).toHaveText('990 pts')
  await expect(page.getByRole('cell', { name: 'PAYOUT' })).toBeVisible()
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
```

- [ ] **Step 4: Run the E2E test**

Run: `npm run test:e2e`
Expected: 1 passed. (First run builds the app; takes a few minutes.)

- [ ] **Step 5: README**

`README.md`:
````markdown
# LastDigit

Free-to-play NBA game: bet points on the last digit of each team's final score (LAL 99 @ GSW 106 → **9-6**). Winners split 90% of the pool by stake. Points have no cash value.

## Setup

```bash
npm install
npm run db:up                 # Postgres 16 on localhost:5433
cp .env.example .env          # then fill AUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD, BALLDONTLIE_API_KEY
npx prisma migrate dev
npm run db:seed               # creates the admin from ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev
```

Get a free balldontlie API key at https://www.balldontlie.io.

## Game sync

`GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET` pulls games (yesterday → +7 days) and settles finished games. Call it every 5 minutes, for example with crontab:

```
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/sync > /dev/null
```

(Vercel Hobby cron runs at most daily; use an external cron service or a VPS crontab.) Admins can also click **Force sync** on Admin → Games.

## Tests

```bash
npm test          # unit + integration (uses lastdigit_test DB)
npm run test:e2e  # Playwright full flow
```
````

- [ ] **Step 6: Final verification and commit**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

```bash
git add -A
git commit -m "feat: add admin seed, Playwright end-to-end test and README"
```
