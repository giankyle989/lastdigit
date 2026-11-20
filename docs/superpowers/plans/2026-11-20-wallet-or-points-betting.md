# Wallet or Points Betting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players choose per slip whether a bet is paid from the wallet or from points (never
mixed, never topped up), and every screen labels wallet amounts `₱`, points `pts` and pools with
no unit.

**Architecture:**
- A pure formatting layer (`src/lib/format.ts` + `<Amount>`) and pure slip helpers
  (`src/lib/slip.ts`, `src/lib/funding.ts`) carry the rules.
- `placeBets` takes an `account` argument and funds only from it.
- The slip gains a persisted `account` choice with a Pay from toggle.
- The remaining tasks swap every `PointsAmount`/`formatPoints` use for the labelled form.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + Postgres, zod, Vitest (integration tests on real
Postgres), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-wallet-or-points-betting-design.md`

## Global Constraints

- Wallet amounts: `₱1,240`, negative `-₱25`, signed positive `+₱100`.
- Points amounts: `40 pts`, signed `+40 pts` / `-40 pts`.
- Pools, ending totals and house take (stakes from both accounts): plain `1,240`.
- A mixed amount is written wallet first: `₱60 + 40 pts`. A zero part is left out; an all-zero
  amount is `₱0`.
- Insufficient messages, verbatim: `Not enough points (40 pts).` and `Not enough in the wallet (₱25).`;
  the switch offer is the button text `Pay from Wallet instead` / `Pay from Points instead`.
- Pay from toggle: a radio group named `Pay from`, options labelled `Wallet` and `Points`.
- Header link accessible name: `₱140 · 40 pts (wallet ₱140, points 40 pts)`. It starts with the
  visible text (WCAG 2.5.3); the brackets are `sr-only`.
- Balances change only through `postEntry()`. Bets lock games, then the user row (CLAUDE.md
  hard rules 1 and 4).
- `src/lib` must not import `@/lib/db`, `@/server/*`, `next/*` or `react`.
- Commits: Conventional Commits, body lines ≤ 100 chars, **no AI attribution of any kind**.
- No schema change and no migration.

## Review Focus

1. **A slip saved before this change** (localStorage without `account`): it must load with its
   picks intact and default the account. Pinned in Task 2 (`parseStoredSlip` test).
2. **Chosen balance negative** (an admin took more than the player had): it counts as 0. The
   slip shows the shortfall and the server refuses. Pinned in Task 2 (`availableFor`) and
   Task 3 (integration).
3. **Points slip whose estimate is at or below the stake** (a crowded ending): the return shows
   only the pts part, never `+ ₱0` or a negative ₱. Pinned in Task 2 (`returnSplit`).
4. **The same ending bet twice from different accounts, then voided after settling**: each
   account gets back exactly its own part. Pinned in Task 3 (mixed-row test).
5. **Switching account after Max was pressed**: Max must recompute from the newly chosen balance
   on the next press, and the over-balance state must show immediately. Pinned in Task 4
   (`maxStakeFor` with the chosen balance) and Task 7 (e2e).

---

### Task 1: Labelled amounts (formatting and `<Amount>`)

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/components/amount.tsx`
- Test: `tests/unit/format.test.ts` (add a `describe`)

**Interfaces:**
- Produces: `type AmountKind = 'wallet' | 'points' | 'pool'`;
  `formatAmount(kind: AmountKind, n: number, opts?: { signed?: boolean }): string`;
  `formatSplit(parts: { wallet: number; points: number }, opts?: { signed?: boolean }): string`;
  `accountKind(account: 'WALLET' | 'POINTS'): AmountKind`;
  `<Amount kind value signed? className? />` and `<SplitAmount wallet points signed? className? />`.
  `formatPoints` and `formatSignedPoints` stay until Task 6 removes them.

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/format.test.ts`, merging the
  import into the existing `@/lib/format` import)

```ts
import { accountKind, formatAmount, formatSplit } from '@/lib/format'

describe('labelled amounts', () => {
  it('formats wallet in pesos, points in pts and pools plain', () => {
    expect(formatAmount('wallet', 1240)).toBe('₱1,240')
    expect(formatAmount('wallet', -25)).toBe('-₱25')
    expect(formatAmount('wallet', 0)).toBe('₱0')
    expect(formatAmount('points', 40)).toBe('40 pts')
    expect(formatAmount('points', -40)).toBe('-40 pts')
    expect(formatAmount('pool', 1240)).toBe('1,240')
  })

  it('adds a plus sign when signed', () => {
    expect(formatAmount('wallet', 100, { signed: true })).toBe('+₱100')
    expect(formatAmount('wallet', -100, { signed: true })).toBe('-₱100')
    expect(formatAmount('points', 40, { signed: true })).toBe('+40 pts')
    expect(formatAmount('wallet', 0, { signed: true })).toBe('₱0')
  })

  it('writes mixed amounts wallet first and drops zero parts', () => {
    expect(formatSplit({ wallet: 60, points: 40 })).toBe('₱60 + 40 pts')
    expect(formatSplit({ wallet: 0, points: 40 })).toBe('40 pts')
    expect(formatSplit({ wallet: 210, points: 0 })).toBe('₱210')
    expect(formatSplit({ wallet: 0, points: 0 })).toBe('₱0')
    expect(formatSplit({ wallet: 210, points: 100 }, { signed: true })).toBe('+₱210 + 100 pts')
  })

  it('maps ledger accounts to kinds', () => {
    expect(accountKind('WALLET')).toBe('wallet')
    expect(accountKind('POINTS')).toBe('points')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/format.test.ts`
Expected: FAIL, `formatAmount is not a function` (or not exported).

- [ ] **Step 3: Implement** (append to `src/lib/format.ts`)

```ts
export type AmountKind = 'wallet' | 'points' | 'pool'

/** "₱1,240" (wallet), "40 pts" (points), "1,240" (pool: stakes from both accounts). */
export function formatAmount(kind: AmountKind, n: number, opts: { signed?: boolean } = {}): string {
  const sign = n < 0 ? '-' : opts.signed && n > 0 ? '+' : ''
  const abs = Math.abs(n).toLocaleString('en-US')
  if (kind === 'wallet') return `${sign}₱${abs}`
  if (kind === 'points') return `${sign}${abs} pts`
  return `${sign}${abs}`
}

/** A wallet + points amount, wallet first: "₱60 + 40 pts". Zero parts are left out. */
export function formatSplit(
  parts: { wallet: number; points: number },
  opts: { signed?: boolean } = {},
): string {
  const out: string[] = []
  if (parts.wallet !== 0) out.push(formatAmount('wallet', parts.wallet, opts))
  if (parts.points !== 0) out.push(formatAmount('points', parts.points, opts))
  return out.length > 0 ? out.join(' + ') : formatAmount('wallet', 0)
}

export function accountKind(account: 'WALLET' | 'POINTS'): AmountKind {
  return account === 'WALLET' ? 'wallet' : 'points'
}
```

Create `src/components/amount.tsx`:

```tsx
import { type AmountKind, formatAmount, formatSplit } from '@/lib/format'
import { cn } from '@/lib/utils'

type Common = {
  /** Leading + for positive values, colored by sign (accent / danger). */
  signed?: boolean
  className?: string
}

function tone(signed: boolean, value: number): string {
  if (!signed) return ''
  return value > 0 ? 'text-primary' : value < 0 ? 'text-danger' : ''
}

/** An amount in its unit: ₱ for wallet, pts for points, plain for pools. */
export function Amount({ kind, value, signed = false, className }: Common & { kind: AmountKind; value: number }) {
  return <span className={cn('num', tone(signed, value), className)}>{formatAmount(kind, value, { signed })}</span>
}

/** A wallet + points amount, wallet first ("₱60 + 40 pts"). */
export function SplitAmount({ wallet, points, signed = false, className }: Common & { wallet: number; points: number }) {
  return (
    <span className={cn('num', tone(signed, wallet + points), className)}>
      {formatSplit({ wallet, points }, { signed })}
    </span>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/format.test.ts` → PASS. Then
`npx eslint src/lib/format.ts src/components/amount.tsx && npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/components/amount.tsx tests/unit/format.test.ts
git commit -m "feat(format): label amounts as wallet pesos, points or plain pools"
```

---

### Task 2: Slip account choice (pure helpers)

**Files:**
- Modify: `src/lib/funding.ts` (remove `splitStake`, add `BetAccount` and the helpers below)
- Modify: `src/lib/slip.ts` (Slip gains `account`; add `setAccount`; remove `fundingLine` and the
  `splitAcrossAccounts` import; keep the unrelated `splitStake(total, n)` in slip.ts)
- Test: `tests/unit/funding.test.ts`, `tests/unit/slip.test.ts`

**Interfaces:**
- Consumes: `formatAmount` (Task 1).
- Produces, in `src/lib/funding.ts`:
  - `type BetAccount = 'WALLET' | 'POINTS'`
  - `type Balances = { wallet: number; points: number }`
  - `availableFor(account: BetAccount, b: Balances): number` (negative → 0)
  - `notEnoughMessage(account: BetAccount, available: number): string`
  - `otherAccount(account: BetAccount): BetAccount`
  - `splitReturn` stays; `Funding` stays.
- Produces, in `src/lib/slip.ts`:
  - `Slip = { picks; lastStake; account: BetAccount | null }`
  - `resolveAccount(chosen: BetAccount | null, b: Balances): BetAccount`
  - `slipShortfall(account: BetAccount, b: Balances, total: number): { message: string; switchTo: BetAccount | null } | null`
  - `returnSplit(account: BetAccount, stake: number, estimate: number): Funding`
  - `bestCaseSplit(picks: SlipPick[], returns: (number | null)[], account: BetAccount): Funding`
  - `SlipAction` gains `{ type: 'setAccount'; account: BetAccount }`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/funding.test.ts`, delete the `splitStake` tests and import, and add:

```ts
import { availableFor, notEnoughMessage, otherAccount } from '@/lib/funding'

describe('bet accounts', () => {
  it('counts only the chosen balance, a negative one as 0', () => {
    expect(availableFor('POINTS', { wallet: 700, points: 40 })).toBe(40)
    expect(availableFor('WALLET', { wallet: 700, points: 40 })).toBe(700)
    expect(availableFor('WALLET', { wallet: -25, points: 40 })).toBe(0)
  })
  it('names the account in the not-enough message', () => {
    expect(notEnoughMessage('POINTS', 40)).toBe('Not enough points (40 pts).')
    expect(notEnoughMessage('WALLET', 25)).toBe('Not enough in the wallet (₱25).')
  })
  it('knows the other account', () => {
    expect(otherAccount('WALLET')).toBe('POINTS')
    expect(otherAccount('POINTS')).toBe('WALLET')
  })
})
```

In `tests/unit/slip.test.ts`:
- Replace every `fundingLine` test with the block below.
- Wherever a test builds a `Slip` literal, add `account: null`. `EMPTY_SLIP` gains it too.

```ts
import { bestCaseSplit, parseStoredSlip, resolveAccount, returnSplit, slipReducer, slipShortfall } from '@/lib/slip'

describe('pay from', () => {
  const b = { wallet: 700, points: 40 }

  it('defaults to points when the player has any, else the wallet', () => {
    expect(resolveAccount(null, b)).toBe('POINTS')
    expect(resolveAccount(null, { wallet: 700, points: 0 })).toBe('WALLET')
    expect(resolveAccount(null, { wallet: 700, points: -5 })).toBe('WALLET')
    expect(resolveAccount('WALLET', b)).toBe('WALLET')
  })

  it('reports a shortfall in the chosen balance and offers the other when it covers the slip', () => {
    expect(slipShortfall('POINTS', b, 40)).toBeNull()
    expect(slipShortfall('POINTS', b, 100)).toEqual({ message: 'Not enough points (40 pts).', switchTo: 'WALLET' })
    expect(slipShortfall('POINTS', b, 800)).toEqual({ message: 'Not enough points (40 pts).', switchTo: null })
    expect(slipShortfall('WALLET', { wallet: -25, points: 40 }, 30)).toEqual({
      message: 'Not enough in the wallet (₱0).',
      switchTo: null,
    })
  })

  it('splits a points return into the stake back as points and the rest as wallet', () => {
    expect(returnSplit('WALLET', 100, 310)).toEqual({ wallet: 310, points: 0 })
    expect(returnSplit('POINTS', 100, 310)).toEqual({ wallet: 210, points: 100 })
    // a crowded ending: the estimate is at or below the stake, so no ₱ part
    expect(returnSplit('POINTS', 100, 100)).toEqual({ wallet: 0, points: 100 })
    expect(returnSplit('POINTS', 100, 80)).toEqual({ wallet: 0, points: 80 })
  })

  it('splits the best case per game', () => {
    const picks = [
      { gameId: 'g1', awayDigit: 1, homeDigit: 2, stake: 100, matchup: 'A @ B' },
      { gameId: 'g1', awayDigit: 3, homeDigit: 4, stake: 50, matchup: 'A @ B' },
      { gameId: 'g2', awayDigit: 0, homeDigit: 0, stake: 20, matchup: 'C @ D' },
    ]
    // best of g1 is the first pick (300), g2's pick returns 60
    expect(bestCaseSplit(picks, [300, 200, 60], 'POINTS')).toEqual({ wallet: 240, points: 120 })
    expect(bestCaseSplit(picks, [300, 200, 60], 'WALLET')).toEqual({ wallet: 360, points: 0 })
    expect(bestCaseSplit(picks, [null, null, null], 'POINTS')).toEqual({ wallet: 0, points: 0 })
  })

  it('stores the choice', () => {
    const s = slipReducer({ picks: [], lastStake: 100, account: null }, { type: 'setAccount', account: 'WALLET' })
    expect(s.account).toBe('WALLET')
  })

  it('loads a slip saved before the choice existed, keeping its picks', () => {
    const old = JSON.stringify({
      picks: [{ gameId: 'g1', awayDigit: 1, homeDigit: 2, stake: 100, matchup: 'A @ B' }],
      lastStake: 100,
    })
    const s = parseStoredSlip(old)
    expect(s.picks).toHaveLength(1)
    expect(s.account).toBeNull()
  })

  it('drops an unknown saved account instead of the whole slip', () => {
    const odd = JSON.stringify({ picks: [], lastStake: 50, account: 'BITCOIN' })
    expect(parseStoredSlip(odd)).toEqual({ picks: [], lastStake: 50, account: null })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/funding.test.ts tests/unit/slip.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement**

`src/lib/funding.ts`: delete `splitStake` and its doc comment, keep `Funding` and `splitReturn`,
and add:

```ts
import { formatAmount } from './format'

export type BetAccount = 'WALLET' | 'POINTS'
export type Balances = { wallet: number; points: number }

/** The chosen balance; a negative balance counts as 0. A slip is paid from one account only. */
export function availableFor(account: BetAccount, b: Balances): number {
  return Math.max(0, account === 'POINTS' ? b.points : b.wallet)
}

export function notEnoughMessage(account: BetAccount, available: number): string {
  return account === 'POINTS'
    ? `Not enough points (${formatAmount('points', available)}).`
    : `Not enough in the wallet (${formatAmount('wallet', available)}).`
}

export function otherAccount(account: BetAccount): BetAccount {
  return account === 'POINTS' ? 'WALLET' : 'POINTS'
}
```

`src/lib/slip.ts`:
- Import `availableFor, type Balances, type BetAccount, type Funding, notEnoughMessage,
  otherAccount` from `./funding`. Remove the `splitStake as splitAcrossAccounts` import, and
  remove `formatPoints` if it is now unused.
- `export type Slip = { picks: SlipPick[]; lastStake: number; account: BetAccount | null }`
- `export const EMPTY_SLIP: Slip = { picks: [], lastStake: DEFAULT_STAKE, account: null }`
- Add `| { type: 'setAccount'; account: BetAccount }` to `SlipAction`.
- In `slipReducer`, add `case 'setAccount': return { ...slip, account: action.account }`.
- `updateAt` must keep `account`: change its return to `{ ...slip, picks: …, lastStake: … }`.
- `storedSlipSchema`: add
  `account: z.enum(['WALLET', 'POINTS']).nullish().catch(null).transform((v) => v ?? null)`.
- Delete `fundingLine`.
- Add:

```ts
/** The slip's account: the player's choice, else points when they have any, else the wallet. */
export function resolveAccount(chosen: BetAccount | null, b: Balances): BetAccount {
  return chosen ?? (b.points > 0 ? 'POINTS' : 'WALLET')
}

/** Why the chosen balance can't pay the slip, and the other account when it can; null when it can. */
export function slipShortfall(
  account: BetAccount,
  b: Balances,
  total: number,
): { message: string; switchTo: BetAccount | null } | null {
  const available = availableFor(account, b)
  if (total <= available) return null
  const other = otherAccount(account)
  return { message: notEnoughMessage(account, available), switchTo: total <= availableFor(other, b) ? other : null }
}

/** A pick's est. return by account: a points stake comes back as points, the profit as wallet. */
export function returnSplit(account: BetAccount, stake: number, estimate: number): Funding {
  if (account === 'WALLET') return { wallet: estimate, points: 0 }
  const points = Math.min(stake, estimate)
  return { wallet: Math.max(0, estimate - stake), points }
}

/** bestCaseReturn, split by account: the best pick of each game. */
export function bestCaseSplit(picks: SlipPick[], returns: (number | null)[], account: BetAccount): Funding {
  const best = new Map<string, { stake: number; ret: number }>()
  picks.forEach((p, i) => {
    const r = returns[i]
    if (r == null) return
    const cur = best.get(p.gameId)
    if (!cur || r > cur.ret) best.set(p.gameId, { stake: p.stake, ret: r })
  })
  const sum: Funding = { wallet: 0, points: 0 }
  for (const { stake, ret } of best.values()) {
    const part = returnSplit(account, stake, ret)
    sum.wallet += part.wallet
    sum.points += part.points
  }
  return sum
}
```

`bet-slip-panel.tsx` still calls `fundingLine`. Keep it compiling in this task: remove that call
and the `slip-funding` paragraph (Task 4 replaces them).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/unit/funding.test.ts tests/unit/slip.test.ts` → PASS;
`npx tsc --noEmit -p .` → only errors in `src/server/bets.ts` about `splitStake` (Task 3 fixes
them). If any other file fails to type-check, fix it here.

- [ ] **Step 5: Commit** (the server still imports `splitStake`, so commit Tasks 2 and 3 back to
  back. If the pre-commit typecheck blocks this commit, do Task 3 first and commit both together
  with the Task 3 message.)

```bash
git add src/lib/funding.ts src/lib/slip.ts src/components/bet-slip/bet-slip-panel.tsx tests/unit/funding.test.ts tests/unit/slip.test.ts
git commit -m "feat(slip): choose wallet or points per slip"
```

---

### Task 3: Server funds a slip from the chosen account only

**Files:**
- Modify: `src/server/bets.ts`
- Modify: `src/app/(player)/actions.ts` (`placeBetsAction`)
- Modify: `src/components/bet-slip/bet-slip-panel.tsx` (pass the account)
- Modify (mechanical): every caller of `placeBets(` / `placeBet(` in `tests/` and `e2e/`
- Test: `tests/integration/place-bets.test.ts`

**Interfaces:**
- Consumes: `BetAccount`, `availableFor`, `notEnoughMessage` (Task 2); `resolveAccount` (Task 2).
- Produces:
  - `placeBets(userId: string, account: unknown, input: unknown, now?: Date): Promise<Bet[]>`
  - `placeBet(userId: string, account: unknown, input: unknown, now?: Date): Promise<Bet>`
  - `betAccountSchema` (zod enum)
  - `placeBetsAction(account: unknown, picks: unknown): Promise<ActionState>`

**Ruling (plan deviation from spec §2, which shows `{ account, picks }`):** `account` is a
separate positional argument. About 100 existing test calls pass a picks array; a positional
argument lets them be migrated with one substitution. The behaviour is the same, and the spec's
Input paragraph is updated in this task's commit.

- [ ] **Step 1: Migrate existing callers** (all fund from the wallet by default via `fundUser`)

```bash
grep -rlE "placeBets?\(" tests e2e | xargs perl -0pi -e "s/\bplaceBets\(\s*([^,()]+?),\s*/placeBets(\$1, 'WALLET', /g; s/\bplaceBet\(\s*([^,()]+?),\s*/placeBet(\$1, 'WALLET', /g"
git diff --stat
```

Check the diff: only calls changed, and none got a doubled `'WALLET'`.

- [ ] **Step 2: Write the failing tests** (add to `tests/integration/place-bets.test.ts`, inside
  the `placeBets` describe; `fundUser(id, amount, 'POINTS')` funds points)

```ts
  it('a points slip spends only points', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    await fundUser(u.id, 200, 'POINTS')
    const g = await makeGame()
    const [bet] = await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 150 }])
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect([after.walletBalance, after.pointsBalance]).toEqual([500, 50])
    expect(bet).toMatchObject({ stake: 150, pointsStake: 150 })
    await expectLedgerConsistent()
  })

  it('a wallet slip spends only the wallet, even with points available', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    await fundUser(u.id, 200, 'POINTS')
    const g = await makeGame()
    const [bet] = await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 150 }])
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect([after.walletBalance, after.pointsBalance]).toEqual([350, 200])
    expect(bet).toMatchObject({ stake: 150, pointsStake: 0 })
  })

  it('refuses when the chosen balance is short, never topping up from the other', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    await fundUser(u.id, 40, 'POINTS')
    const g = await makeGame()
    const picks = [
      { gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 30 },
      { gameId: g.id, awayDigit: 3, homeDigit: 4, stake: 30 },
    ]
    await expect(placeBets(u.id, 'POINTS', picks)).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Not enough points (40 pts).',
    })
    await expect(
      placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 1001 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet (₱1,000).' })
    expect(await prisma.bet.count()).toBe(0)
    await expectLedgerConsistent()
  })

  it('counts a negative chosen balance as 0', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500, 'POINTS')
    await fundUser(u.id, -10) // wallet -10 (an admin took more than the player had)
    const g = await makeGame()
    await expect(
      placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 1 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough in the wallet (₱0).' })
  })

  it('requires an account', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    const g = await makeGame()
    const pick = [{ gameId: g.id, awayDigit: 1, homeDigit: 2, stake: 10 }]
    await expect(placeBets(u.id, undefined, pick)).rejects.toBeInstanceOf(ZodError)
    await expect(placeBets(u.id, 'BOTH', pick)).rejects.toBeInstanceOf(ZodError)
  })

  it('merges a wallet and a points bet on one ending; settle and void return each part', async () => {
    const u = await makeUser()
    await fundUser(u.id, 500)
    await fundUser(u.id, 500, 'POINTS')
    const g = await makeGame()
    await placeBets(u.id, 'WALLET', [{ gameId: g.id, awayDigit: 7, homeDigit: 3, stake: 60 }])
    await placeBets(u.id, 'POINTS', [{ gameId: g.id, awayDigit: 7, homeDigit: 3, stake: 40 }])
    const bet = await prisma.bet.findFirstOrThrow({ where: { userId: u.id } })
    expect(bet).toMatchObject({ stake: 100, pointsStake: 40 })
    await expectLedgerConsistent()
  })
```

`fundUser(u.id, -10)` posts a negative grant. If `postEntry` refuses that, set up the negative
wallet the way `tests/integration/place-bets.test.ts` or `admin-players.test.ts` already does
(search for `walletBalance: -` or `TAKE_`), keeping the assertion the same.

For the settle and void half of Review Focus #4, add to `tests/integration/settlement.test.ts`
(inside `describe('settleGame', …)`; it uses that file's `finish` default score 99-106, so ending
9-6 wins):

```ts
  it('a merged wallet + points bet: a win returns the points stake as points, the rest to wallet', async () => {
    const admin = await makeUser({ role: 'SUPERADMIN' })
    const m = await makeUser({ username: 'mixed' })
    const c = await makeUser({ username: 'loser' })
    await fundUser(m.id, 1000)
    await fundUser(m.id, 500, 'POINTS')
    await fundUser(c.id, 1000)
    const g = await makeGame()
    await placeBet(m.id, 'WALLET', { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 60 })
    await placeBet(m.id, 'POINTS', { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 40 })
    await placeBet(c.id, 'WALLET', { gameId: g.id, awayDigit: 0, homeDigit: 0, stake: 300 })
    await finish(g.id)
    await settleGame(g.id)

    // pool 400, 90% = 360 to the only winner: 40 back as points, 320 to the wallet
    const won = await prisma.user.findUniqueOrThrow({ where: { id: m.id } })
    expect([won.walletBalance, won.pointsBalance]).toEqual([1000 - 60 + 320, 500])
    const payouts = await prisma.transaction.findMany({
      where: { userId: m.id, type: 'PAYOUT' },
      orderBy: { account: 'asc' },
    })
    expect(payouts.map((t) => [t.account, t.amount])).toEqual([
      ['POINTS', 40],
      ['WALLET', 320],
    ])

    await voidGame(admin.id, g.id, 'Wrong score')
    const back = await prisma.user.findUniqueOrThrow({ where: { id: m.id } })
    expect([back.walletBalance, back.pointsBalance]).toEqual([1000, 500])
    expect(await balanceOf(c.id)).toBe(1000)
    await expectLedgerConsistent()
  })
```

If `orderBy: { account: 'asc' }` sorts the enum by declaration order (`WALLET` before `POINTS`),
swap the two expected rows; the assertion is the pair of rows, not their order.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/integration/place-bets.test.ts`
Expected: FAIL (`placeBets` treats `'POINTS'` as the picks argument).

- [ ] **Step 4: Implement** in `src/server/bets.ts`

```ts
import { availableFor, type BetAccount, notEnoughMessage } from '@/lib/funding'

export const betAccountSchema = z.enum(['WALLET', 'POINTS'], {
  errorMap: () => ({ message: 'Choose wallet or points' }),
})
```

- Change the signature to `placeBets(userId: string, account: unknown, input: unknown, now = new Date())`
  and parse first: `const from: BetAccount = betAccountSchema.parse(account)`, then
  `const picks = placeBetsSchema.parse(input)`.
- Update the doc comment: each slip is paid entirely from `account` (wallet-or-points spec §2).
- Replace `pointsLeft`/`walletLeft` with:

```ts
      const available = availableFor(from, { wallet: user.walletBalance, points: user.pointsBalance })
      const total = picks.reduce((sum, p) => sum + p.stake, 0)
      if (total > available) throw new DomainError('INSUFFICIENT_BALANCE', notEnoughMessage(from, available))
```

  Put this right after the staff check and before the ending checks, so the shortfall message
  wins over per-pick errors.
- In the loop, delete the per-pick `stake > pointsLeft + walletLeft` check and `splitStake`. Then:

```ts
        const pointsPart = from === 'POINTS' ? stake : 0
        const bet = await tx.bet.upsert({
          where: { userId_gameId_awayDigit_homeDigit: { userId, gameId, awayDigit, homeDigit } },
          create: { userId, gameId, awayDigit, homeDigit, stake, pointsStake: pointsPart },
          update: { stake: { increment: stake }, pointsStake: { increment: pointsPart } },
        })
        try {
          await postEntry(
            tx,
            { userId, account: from, type: 'BET', amount: -stake, gameId, betId: bet.id },
            { requireFunds: true },
          )
        } catch (e) {
          throw e instanceof DomainError ? fail(index, pick, e) : e
        }
```

  Delete the `pointsLeft -= …` / `walletLeft -= …` lines.
- `placeBet(userId: string, account: unknown, input: unknown, now = new Date())` calls
  `placeBets(userId, account, [input], now)`.

`src/app/(player)/actions.ts`:

```ts
export async function placeBetsAction(account: unknown, picks: unknown): Promise<ActionState> {
  const user = await requirePlayer()
  const result = await runAction(
    () => placeBets(user.id, account, picks),
    (bets) => `${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} placed`,
  )
  revalidatePath('/', 'layout')
  return result
}
```

`bet-slip-panel.tsx`: in `confirm()`, compute
`const account = resolveAccount(slip.account, { wallet: fresh.walletBalance, points: fresh.pointsBalance })`
and call `placeBetsAction(account, picks.map(…))`. `slip.account` is exposed by the provider in
Task 4. Until then, read it from the provider value: add
`account: slip.account` to `SlipContextValue` and the provider's `value` now if Task 4 isn't
done.

Update spec §2 "Input" in `docs/superpowers/specs/2026-11-20-wallet-or-points-betting-design.md`
to `placeBets(userId, account, picks, now)` with `account: 'WALLET' | 'POINTS'` validated by zod.

- [ ] **Step 5: Run the whole suite and fix tests that relied on points-first**

Run: `npm run check`
Expected: new tests PASS. Tests that funded **points** and bet without saying so now fail with
`INSUFFICIENT_BALANCE` or wrong balances, because the migration made them `'WALLET'`. For each
one, change that call to `'POINTS'` if the test is about points. If it asserted the old
points-then-wallet split, rewrite it to two slips (one per account) with the same totals. Do not
weaken an assertion to make it pass.

- [ ] **Step 6: Commit**

```bash
git add -A src tests e2e docs/superpowers/specs/2026-11-20-wallet-or-points-betting-design.md
git commit -m "feat(bets): pay each slip from the wallet or from points, never both

placeBets takes the account; the slip total must fit in that balance alone, and only that
account is charged. splitStake (points first) is gone. A same-ending bet from the other
account merges into one row, split by pointsStake as before."
```

---

### Task 4: Pay from toggle and slip totals

**Files:**
- Create: `src/components/bet-slip/pay-from.tsx`
- Modify: `src/components/bet-slip/slip-provider.tsx`, `src/components/bet-slip/bet-slip-panel.tsx`,
  `src/components/bet-slip/slip-dock.tsx`
- Test: covered by Task 2's pure tests and Task 7's e2e (no React unit tests in this repo)

**Interfaces:**
- Consumes: `resolveAccount`, `slipShortfall`, `returnSplit`, `bestCaseSplit`, `maxStakeFor`
  (Task 2); `<Amount>`, `<SplitAmount>`, `accountKind` (Task 1).
- Produces: `useSlip()` gains `account: BetAccount | null`, `wallet: number` and
  `setAccount(a: BetAccount): void`. The context's `balance` field is removed (callers use
  `wallet`/`points`).

- [ ] **Step 1: Provider.** Replace the `balance` prop/field with `wallet` (the server-rendered
  wallet balance). Add `account: slip.account` and
  `setAccount: (account) => dispatch({ type: 'setAccount', account })`. In
  `src/app/(player)/layout.tsx`, pass `wallet={user.walletBalance}` instead of `balance=…`.
- [ ] **Step 2: Toggle component** (`pay-from.tsx`)

```tsx
'use client'

import type { BetAccount } from '@/lib/funding'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  account: BetAccount
  wallet: number
  points: number
  disabled?: boolean
  onChange: (account: BetAccount) => void
}

/** "Pay from" radio group: a slip is paid from one balance only (wallet-or-points spec §3). */
export function PayFrom({ account, wallet, points, disabled, onChange }: Props) {
  const options: { value: BetAccount; label: string; amount: string }[] = [
    { value: 'WALLET', label: 'Wallet', amount: formatAmount('wallet', wallet) },
    { value: 'POINTS', label: 'Points', amount: formatAmount('points', points) },
  ]
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="text-muted-foreground mb-1 text-sm">Pay from</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'border-border flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-1.5 text-sm',
              account === o.value && 'border-primary ring-primary/40 ring-2',
            )}
          >
            <input
              type="radio"
              name="pay-from"
              value={o.value}
              checked={account === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="font-medium">{o.label}</span>
            <span className="num text-muted-foreground text-xs">{o.amount}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
```

Its accessible name per option is "Wallet ₱700" / "Points 40 pts". Add `aria-label={o.label}` on
the input so the option names are exactly `Wallet` and `Points` (Global Constraints).

- [ ] **Step 3: Panel.** In `bet-slip-panel.tsx`:

```tsx
  const balances = {
    wallet: status?.walletBalance ?? slip.wallet,
    points: status?.pointsBalance ?? slip.points,
  }
  const account = resolveAccount(slip.account, balances)
  const available = availableFor(account, balances)
  const kind = accountKind(account)
  const total = slipTotal(slip.picks)
  const shortfall = slipShortfall(account, balances, total)
  const bestReturn = bestCaseSplit(slip.picks, returns, account)
  const disabled = pending || shortfall !== null || anyClosed || anyInvalid
```

- Render `<PayFrom account={account} wallet={balances.wallet} points={balances.points}
  disabled={pending} onChange={slip.setAccount} />` above the picks list.
- Max: `onClick={() => slip.setMax(i, available)}`.
- Per-pick return:
  `Est. return if it hits <SplitAmount {...returnSplit(account, p.stake, returns[i])} />`.
- Totals `<dl>`:
  - Total stake: `<Amount kind={kind} value={total} />` (danger color when `shortfall`);
  - Available: `<Amount kind={kind} value={available} />`;
  - Est. max return: `<SplitAmount wallet={bestReturn.wallet} points={bestReturn.points} />`.
- Below the totals:

```tsx
      {shortfall && (
        <p className="text-danger text-sm" role="alert">
          {shortfall.message}{' '}
          {shortfall.switchTo && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0"
              onClick={() => slip.setAccount(shortfall.switchTo!)}>
              Pay from {shortfall.switchTo === 'WALLET' ? 'Wallet' : 'Points'} instead
            </Button>
          )}
        </p>
      )}
```

  Avoid the non-null assertion if lint forbids it: capture `const switchTo = shortfall?.switchTo`
  above.
- In `confirm()`, use `resolveAccount(slip.account, { wallet: fresh.walletBalance, points:
  fresh.pointsBalance })` (from Task 3).
- Remove `PointsAmount` and the unused imports.
- [ ] **Step 4: Dock.** `slip-dock.tsx` shows the slip total:
  `<Amount kind={accountKind(resolveAccount(slip.account, { wallet: slip.wallet, points: slip.points }))} value={slipTotal(slip.picks)} />`.
- [ ] **Step 5: Verify**

Run: `npm run check` → PASS. Run `npm run dev` and open a game as `player1`
(`player12345`; give it points from the admin drawer). Check that:
- the toggle switches;
- the Points total turns red with the message when it is too high;
- the switch button works;
- Max follows the chosen balance.

- [ ] **Step 6: Commit**

```bash
git add src/components/bet-slip src/app/'(player)'/layout.tsx
git commit -m "feat(slip): pay from toggle, per-account totals and the not-enough message"
```

---

### Task 5: Player screens show ₱, pts and plain pools

**Files (modify):**
- `src/components/shell/player-header.tsx`
- `src/app/(player)/wallet/page.tsx`
- `src/app/(player)/bets/page.tsx`
- `src/app/(player)/games/[id]/page.tsx`
- `src/components/bet-result.tsx`
- `src/components/games/game-card.tsx`, `src/components/games/game-header.tsx`
- `src/components/games/ending-picker.tsx`, `src/components/games/ending-heatmap.tsx`,
  `src/components/games/multi-add-tray.tsx`
- `src/app/(player)/more/referral/page.tsx`
- `src/components/support/new-ticket-form.tsx`

**Interfaces:** consumes `<Amount>`, `<SplitAmount>`, `formatAmount`, `accountKind` (Task 1) and
`splitReturn` (`src/lib/funding.ts`).

- [ ] **Step 1: Header** (`player-header.tsx`): replace the single total with

```tsx
          <Link href="/wallet" className="bg-surface-2 border-border hover:border-primary/60 rounded-full border px-3 py-1 text-sm">
            <Amount kind="wallet" value={wallet} className="text-primary font-semibold" />
            <span className="text-muted-foreground"> · </span>
            <Amount kind="points" value={points} />
            <span className="sr-only">
              {' '}
              (wallet {formatAmount('wallet', wallet)}, points {formatAmount('points', points)})
            </span>
          </Link>
```

  For wallet 140 and points 40, the accessible name must be exactly
  `₱140 · 40 pts (wallet ₱140, points 40 pts)` (Global Constraints). Task 7's e2e asserts it; if
  whitespace differs, adjust the spans, not the assertion. Delete the `total` variable.
- [ ] **Step 2: Wallet page**:
  - cards `wallet-balance` → `<Amount kind="wallet" …/>`, `points-balance` → `<Amount kind="points" …/>`;
  - history rows (lines ~127–129) → `<Amount kind={accountKind(t.account)} value={t.amount} signed …/>` and
    `<Amount kind={accountKind(t.account)} value={t.balanceAfter} />`. Make sure the query selects `account`.
- [ ] **Step 3: My Bets and the game page**:
  - stake → `<SplitAmount wallet={b.stake - b.pointsStake} points={b.pointsStake} className="text-muted-foreground" />`
    (select `pointsStake` in the queries in `src/server/queries/player.ts` if they don't already);
  - `<BetResult result={b.result} payout={b.payout} pointsStake={b.pointsStake} />`.
- [ ] **Step 4: BetResult**: add a `pointsStake: number` prop. Won text becomes
  ``Won ${formatSplit(splitReturn(payout, pointsStake), { signed: true })}``, e.g. `Won +₱210 + 100 pts`.
  Keep the other states' text. Update every `<BetResult>` caller (grep).
- [ ] **Step 5: Pools and endings (plain)**:
  - game card and game header pool → `<Amount kind="pool" …/>` (the header drops its ` pts` unit);
  - ending picker: ending stake and the "per 100" estimate → `kind="pool"`. "Adds at your last
    stake" → plain `kind="pool"`, since the account is chosen on the slip;
  - heatmap aria label `Ending 1-2, 120 staked` → `formatAmount('pool', stake)`;
  - multi-add tray: `n × 50 = 150` with no ` pts` (use `formatAmount('pool', …)` for each number).
- [ ] **Step 6: Referral page and support form**:
  - referral cap → `<Amount kind="points" …/>`;
  - support hint → `Wallet: {formatAmount('wallet', wallet)} available. Points can't be cashed out.`
- [ ] **Step 7: Verify**: `grep -rn "PointsAmount\|formatPoints" src/app/'(player)' src/components`
  lists only admin-facing components (if any) and `points-amount.tsx`. Then `npm run check` → PASS.
- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(ui): wallet in pesos, points in pts and plain pools on player screens"
```

---

### Task 6: Admin screens, then remove the old helpers

**Files (modify):**
- `src/app/admin/page.tsx`
- `src/app/admin/players/page.tsx`, `src/app/admin/players/player-drawer.tsx`
- `src/app/admin/ledger/page.tsx`
- `src/app/admin/support/ticket-drawer.tsx`
- `src/app/admin/games/page.tsx`, `src/app/admin/games/game-drawer.tsx`
- Delete: `src/components/points-amount.tsx`; remove `formatPoints`/`formatSignedPoints` from
  `src/lib/format.ts` once nothing imports them (update `tests/unit/format.test.ts`).

- [ ] **Step 1: Apply these rules**

| Where                                                                               | Use                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard: player count (`formatPoints(s.playerCount)`)                              | `s.playerCount.toLocaleString('en-US')` (a count, not money)                                                                                                        |
| Dashboard: open pool total, house take 7d / all time, per-game volume                | `kind="pool"` / `formatAmount('pool', …)`                                                                                                                            |
| Dashboard: "Negative …" row (wallet + points summed)                                 | `<SplitAmount wallet={Math.min(u.walletBalance, 0)} points={Math.min(u.pointsBalance, 0)} className="text-danger" />`                                                |
| Players list: wallet and points columns                                              | `kind="wallet"` / `kind="points"`, keeping the danger class                                                                                                          |
| Player drawer: balances (lines ~58, ~64)                                             | `kind="wallet"` / `kind="points"`                                                                                                                                    |
| Player drawer: bet stake (line ~270)                                                 | `<SplitAmount wallet={b.stake - b.pointsStake} points={b.pointsStake} />` (select `pointsStake`)                                                                    |
| Player drawer: transactions (lines ~288–289)                                         | `kind={accountKind(t.account)}`, `signed` on amount                                                                                                                 |
| Player drawer: Give/Take points and Cash in/out dialogs                              | The Amount field's label or hint names the unit: `Amount (₱)` for Cash in/out, `Amount (pts)` for points. Keep the field's accessible name starting with `Amount`. |
| Ledger: amount and balance-after cells                                               | `kind={accountKind(t.account)}`                                                                                                                                      |
| Ledger: filtered total (`result.totalAmount`)                                        | `kind` of the account filter when one account is selected, else `kind="pool"`                                                                                        |
| Ticket drawer: wallet hint                                                           | `Wallet: <Amount kind="wallet" …/>`. The test id `ticket-cash-hint` text becomes `Wallet: ₱0` for 0 (update `e2e/support.spec.ts` in Task 7).                        |
| Games list: pool and house take; game drawer: house take, bet stake, bet payout      | Pool and house take → `kind="pool"`. Bet stake → `SplitAmount` as in the player drawer. Bet payout → `<SplitAmount {...splitReturn(b.payout, b.pointsStake)} signed />` |

For an Amount dialog, read the dialog component (`src/components/admin/action-dialog.tsx` or the
drawer's own markup) before editing, and keep its existing `getByLabel('Amount')` working
(`e2e/wallet.spec.ts` uses it).

- [ ] **Step 2: Remove the old helpers**: delete `src/components/points-amount.tsx`. Remove
  `formatPoints` and `formatSignedPoints` from `src/lib/format.ts` and their tests. Run
  `grep -rn "PointsAmount\|formatPoints\|formatSignedPoints" src tests` → no matches.
- [ ] **Step 3: Verify**: `npm run check` → PASS.
- [ ] **Step 4: Commit**

```bash
git add -A src tests
git commit -m "feat(admin): label wallet, points and pool amounts; drop PointsAmount"
```

---

### Task 7: End-to-end

**Files (modify):** `e2e/wallet.spec.ts`, `e2e/full-flow.spec.ts`, `e2e/support.spec.ts`

- [ ] **Step 1: `e2e/support.spec.ts`**: `Wallet: 0 pts available` → `Wallet: ₱0 available`;
  `ticket-cash-hint` → `Wallet: ₱0`.
- [ ] **Step 2: `e2e/full-flow.spec.ts`**: `wallet-balance` → `₱1,350`; `points-balance` →
  `800 pts`. The daily bonus toast `+100 pts daily bonus` is unchanged. Wherever the flow places a
  bet that relied on points-first, choose the account first with
  `getByRole('radio', { name: 'Wallet' })` or `'Points'`. On mobile, open the slip first, as the
  spec already does. Then recompute its expected balances.
- [ ] **Step 3: `e2e/wallet.spec.ts`**: replace the "40 points + 60 wallet" part. Keep the
  setup (wallet 200, then give 50 and take 10, so points are 40). Then:

```ts
  // carol bets 30 from points, then 60 from the wallet, on one ending each
  // ...login, open the game, add LAL 1 / GSW 2 with stake 30 (setStake via the slip's stake input)
  await page.getByRole('radio', { name: 'Points' }).check()
  // too much from points: blocked, with the offer to switch
  await stakeInput.fill('100')
  await expect(page.getByRole('alert').filter({ visible: true })).toContainText('Not enough points (40 pts).')
  await expect(page.getByRole('button', { name: 'Confirm bets' })).toBeDisabled()
  await stakeInput.fill('30')
  await page.getByRole('button', { name: 'Confirm bets' }).click()
  await expect(page.getByText('1 bet placed')).toBeVisible()
  // second slip from the wallet on another ending
  // ...add LAL 3 / GSW 4, stake 60, choose Wallet, confirm
  await page.goto('/wallet')
  await expect(page.getByTestId('wallet-balance')).toHaveText('₱140')
  await expect(page.getByTestId('points-balance')).toHaveText('10 pts')
  await expect(page.getByRole('link', { name: '₱140 · 10 pts (wallet ₱140, points 10 pts)', exact: true })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: /^BetPoints/ })).toHaveCount(1)
  await expect(page.getByRole('listitem').filter({ hasText: /^BetWallet/ })).toHaveCount(1)
```

Write the elided lines with this file's existing patterns:
- picking digits: `getByRole('button', { name: 'LAL digit 1' })`;
- adding: `Add to slip`;
- on mobile: open the slip with `/^Open bet slip/`, and close it before going on;
- the stake input is labelled `Stake for LAL @ GSW 1-2`.

The `BetPoints`/`BetWallet` row filters depend on the history row text. If Task 5 changed it,
match the new text and keep one row per account. Keep the overflow check at the end.

- [ ] **Step 4: Run**

Run: `npm run test:e2e` → 8 passed (desktop + mobile for each spec). Then `npm run check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test(e2e): bet from points and from the wallet; ₱ and pts labels"
```
