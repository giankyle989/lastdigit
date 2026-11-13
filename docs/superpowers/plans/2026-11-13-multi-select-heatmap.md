# Multi-select Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player tap several heatmap cells on a game and add them all to the bet slip in one tap, at the same stake each or with one total split across them, with the slip raised to 100 picks.

**Architecture:** All rules live as pure functions in `src/lib/slip.ts` (split, room, the tray's plan, the `addMany` reducer action) and are unit-tested there. The UI is thin: `EndingHeatmap` gains a multi-select mode, a new `MultiAddTray` renders a plan and dispatches it, and `EndingPicker` owns the selection. The server only changes the pick limit (shared constant) and the `placeBets` transaction timeout.

**Tech Stack:** Next.js 15 App Router, React 19 client components, Tailwind, shadcn/ui, sonner toasts, Prisma 6 + Postgres, Vitest (node env, no component tests), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-multi-select-heatmap-design.md`

## Global Constraints

- `MAX_SLIP_PICKS = 100` (was 20); `MAX_STAKE = 1_000_000` stays.
- `splitStake(total, n)`: each gets `floor(total / n)`, the first `total mod n` endings (away digit, then home digit order) get one more; requires `n ≥ 1` and `total ≥ n`.
- Blocked-state hints, verbatim: "Enter a stake" · "At least 1 pt per ending" · "At most 1,000,000 pts per ending" · "The slip has room for X more endings".
- Toast after adding, verbatim: "N endings added to the slip" ("1 ending added to the slip" for one).
- Add is all-or-nothing; an ending already in the slip gets the stake added and uses no room.
- Last stake after adding: the per-ending stake (Per ending) or `floor(total / n)` (Split total).
- Pickers tab unchanged; on the Heatmap tab the tray replaces the single **Add to slip** button.
- Selected cell: ring + check mark + `aria-pressed="true"`, state not repeated in the label.
- Stake mode: native radios in a `fieldset` with a legend; selection count in a polite live region.
- No schema change, no migration. Never add AI attribution to commits. Never use `--no-verify`.
- Architecture rules: `src/lib` must not import `@/lib/db`, `@/server/*`, `next/*` or `react`; `src/components` must not import `@/server/*` or `@/lib/db`.

## Review Focus

- A stake typed as text like "1e3", "-5" or "" → treated as 0 and Add disabled with "Enter a stake" (Task 2 test via `parseStakeInput` + `planMultiAdd`).
- Selection includes endings already in the slip while the slip is full → still allowed, they merge (Task 2 test).
- Quick-add buttons push a per-ending stake past 1,000,000 → blocked with "At most 1,000,000 pts per ending" (Task 2 test).
- Split total with an exact multiple vs a remainder → cost line shows "100 each" vs "100–101 each" (Task 2 test on `perEnding.min/max`).
- Game closes while cells are selected → tray disappears, grid read-only (Task 4: `open` gates both).
- Tapping the same cell twice → it deselects; Clear empties the set (Task 4 manual + E2E selects distinct cells).

---

### Task 1: Raise the slip limit to 100 and give `placeBets` a 30 s timeout

**Files:**
- Modify: `src/lib/game/limits.ts:2`
- Modify: `src/server/bets.ts` (the `prisma.$transaction(async (tx) => { ... })` in `placeBets`)
- Test: `tests/unit/slip.test.ts` (cap test, stored-slip test), `tests/integration/place-bets.test.ts`

**Interfaces:**
- Produces: `MAX_SLIP_PICKS === 100`, used by `src/lib/slip.ts`, `src/server/bets.ts`, `src/server/queries/player.ts`, `slip-provider.tsx` without further edits.

- [ ] **Step 1: Update the tests to the new limit**

In `tests/unit/slip.test.ts`, replace the cap test:

```ts
  it('caps the slip at 100 picks but still merges into existing ones', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 100; i++) s = add(s, pick(`g${i}`))
    expect(s.picks).toHaveLength(100)
    expect(canAdd(s, pick('g100'))).toBe(false)
    expect(add(s, pick('g100'))).toBe(s)
    expect(canAdd(s, pick('g3'))).toBe(true)
    expect(add(s, pick('g3')).picks[3]?.stake).toBe(200)
    expect(slipTotal(s.picks)).toBe(10_100)
  })
```

and in the stored-slip test change `length: 21` to `length: 101`, and add after it:

```ts
    const full = Array.from({ length: 100 }, (_, i) => ({ ...pick(`g${i}`), stake: 1 }))
    expect(parseStoredSlip(JSON.stringify({ picks: full, lastStake: 100 })).picks).toHaveLength(100)
```

In `tests/integration/place-bets.test.ts`, change the oversized case `length: 21` to `length: 101`, and add:

```ts
  it('places a 100-pick slip covering every ending of a game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 100)
    const g = await makeGame()
    const picks = Array.from({ length: 100 }, (_, i) => ({
      gameId: g.id,
      awayDigit: Math.floor(i / 10),
      homeDigit: i % 10,
      stake: 1,
    }))
    const bets = await placeBets(u.id, picks)
    expect(bets).toHaveLength(100)
    expect(await balanceOf(u.id)).toBe(0)
    expect(await poolOf(g.id)).toBe(100)
    await expectLedgerConsistent()
  })
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/slip.test.ts tests/integration/place-bets.test.ts`
Expected: FAIL — the cap test stops at 20 picks; the 100-pick slip is rejected with a ZodError.

- [ ] **Step 3: Implement**

`src/lib/game/limits.ts`:

```ts
/** Most picks a bet slip may hold (spec §4.3, §6.1; multi-select heatmap spec §3.2). */
export const MAX_SLIP_PICKS = 100
```

`src/server/bets.ts`, in `placeBets`, pass a timeout as the second argument of the transaction (the closing `})` of the callback becomes):

```ts
    return bets
  }, { timeout: 30_000 }) // a 100-pick slip is ~300 writes, beyond Prisma's 5 s default
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tests/unit/slip.test.ts tests/integration/place-bets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/limits.ts src/server/bets.ts tests/unit/slip.test.ts tests/integration/place-bets.test.ts
git commit -m "feat: raise the bet slip limit to 100 picks"
```

---

### Task 2: Slip rules for adding many endings

**Files:**
- Modify: `src/lib/slip.ts`
- Test: `tests/unit/slip.test.ts`

**Interfaces:**
- Consumes: `MAX_SLIP_PICKS`, `MAX_STAKE` from `src/lib/game/limits.ts`; `formatPoints` from `src/lib/format.ts`.
- Produces (all exported from `@/lib/slip`):
  - `type Ending = { awayDigit: number; homeDigit: number }`
  - `type StakeMode = 'perEnding' | 'splitTotal'`
  - `endingKey(e: Ending): string` → `"a-h"`
  - `splitStake(total: number, n: number): number[]`
  - `slipRoom(slip: Slip): number`
  - `newPickCount(slip: Slip, picks: Omit<NewPick, 'matchup'>[]): number`
  - `type MultiAddPlan = { picks: SlipPick[]; total: number; perEnding: { min: number; max: number }; lastStake: number; blocked: string | null }`
  - `planMultiAdd(input: { slip: Slip; gameId: string; matchup: string; endings: Ending[]; mode: StakeMode; stake: number }): MultiAddPlan`
  - `SlipAction` gains `{ type: 'addMany'; picks: SlipPick[]; lastStake: number }`

- [ ] **Step 1: Write the failing tests**

Add to the import list in `tests/unit/slip.test.ts`: `endingKey, newPickCount, planMultiAdd, slipRoom, splitStake`. Append:

```ts
describe('splitStake', () => {
  it('splits evenly and gives the remainder to the first endings', () => {
    expect(splitStake(600, 6)).toEqual([100, 100, 100, 100, 100, 100])
    expect(splitStake(100, 6)).toEqual([17, 17, 17, 17, 16, 16])
    expect(splitStake(5, 1)).toEqual([5])
    expect(splitStake(3, 3)).toEqual([1, 1, 1])
  })

  it('rejects fewer points than endings, or no endings', () => {
    expect(() => splitStake(2, 3)).toThrow()
    expect(() => splitStake(5, 0)).toThrow()
  })
})

describe('addMany and the multi-add plan', () => {
  const base = { gameId: 'g1', matchup: 'LAL @ GSW' }
  const e = (a: number, h: number) => ({ awayDigit: a, homeDigit: h })
  const plan = (slip: Slip, endings: { awayDigit: number; homeDigit: number }[], mode: 'perEnding' | 'splitTotal', stake: number) =>
    planMultiAdd({ slip, ...base, endings, mode, stake })

  it('per ending: every ending at the stake, in grid order', () => {
    const p = plan(EMPTY_SLIP, [e(3, 1), e(0, 9), e(0, 2)], 'perEnding', 50)
    expect(p.blocked).toBeNull()
    expect(p.picks.map((x) => endingKey(x))).toEqual(['0-2', '0-9', '3-1'])
    expect(p.picks.every((x) => x.stake === 50 && x.gameId === 'g1' && x.matchup === 'LAL @ GSW')).toBe(true)
    expect(p).toMatchObject({ total: 150, perEnding: { min: 50, max: 50 }, lastStake: 50 })
  })

  it('split total: shares follow splitStake and last stake is the smallest share', () => {
    const p = plan(EMPTY_SLIP, [e(0, 0), e(0, 1), e(0, 2)], 'splitTotal', 301)
    expect(p.picks.map((x) => x.stake)).toEqual([101, 100, 100])
    expect(p).toMatchObject({ total: 301, perEnding: { min: 100, max: 101 }, lastStake: 100, blocked: null })
  })

  it('blocks with the spec hints', () => {
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', 0).blocked).toBe('Enter a stake')
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', parseStakeInput('1e3')).blocked).toBe('Enter a stake')
    expect(plan(EMPTY_SLIP, [e(0, 0), e(0, 1), e(0, 2)], 'splitTotal', 2).blocked).toBe('At least 1 pt per ending')
    expect(plan(EMPTY_SLIP, [e(0, 0), e(0, 1)], 'splitTotal', 2_000_001).blocked).toBe(
      'At most 1,000,000 pts per ending',
    )
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', 1_000_010).blocked).toBe('At most 1,000,000 pts per ending')
  })

  it('counts room only for endings not already in the slip', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 99; i++) s = add(s, pick(`x${i}`))
    s = add(s, pick('g1', 0, 0))
    expect(slipRoom(s)).toBe(0)
    expect(newPickCount(s, [{ gameId: 'g1', ...e(0, 0) }, { gameId: 'g1', ...e(0, 1) }])).toBe(1)
    expect(plan(s, [e(0, 0)], 'perEnding', 10).blocked).toBeNull() // merges, needs no room
    expect(plan(s, [e(0, 0), e(0, 1)], 'perEnding', 10).blocked).toBe('The slip has room for 0 more endings')
  })

  it('addMany merges and appends all picks and sets the last stake', () => {
    const s0 = add(EMPTY_SLIP, pick('g1', 0, 0)) // 100 on 0-0
    const p = plan(s0, [e(0, 0), e(0, 1)], 'perEnding', 30)
    const s = slipReducer(s0, { type: 'addMany', picks: p.picks, lastStake: p.lastStake })
    expect(s.picks.map((x) => [endingKey(x), x.stake])).toEqual([
      ['0-0', 130],
      ['0-1', 30],
    ])
    expect(s.lastStake).toBe(30)
  })

  it('addMany adds nothing when the slip lacks room', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 99; i++) s = add(s, pick(`x${i}`))
    const p = plan(EMPTY_SLIP, [e(0, 0), e(0, 1)], 'perEnding', 10) // planned against an emptier slip
    expect(slipReducer(s, { type: 'addMany', picks: p.picks, lastStake: 10 })).toBe(s)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/slip.test.ts`
Expected: FAIL — `splitStake` (and the others) are not exported.

- [ ] **Step 3: Implement in `src/lib/slip.ts`**

Add the import `import { formatPoints } from './format'`. Add to the types and the `SlipAction` union:

```ts
export type Ending = { awayDigit: number; homeDigit: number }
export type StakeMode = 'perEnding' | 'splitTotal'
```

```ts
  | { type: 'addMany'; picks: SlipPick[]; lastStake: number }
```

Add the helpers (after `slipTotal`):

```ts
export function endingKey(e: Ending): string {
  return `${e.awayDigit}-${e.homeDigit}`
}

/** `total` over `n` endings: floor(total / n) each, the first `total mod n` get one more. */
export function splitStake(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(total) || total < n) {
    throw new Error(`splitStake: cannot split ${total} over ${n}`)
  }
  const base = Math.floor(total / n)
  const extra = total % n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}

export function slipRoom(slip: Slip): number {
  return Math.max(0, MAX_SLIP_PICKS - slip.picks.length)
}

/** How many of `picks` are endings the slip does not hold yet (merges need no room). */
export function newPickCount(slip: Slip, picks: Omit<NewPick, 'matchup'>[]): number {
  return picks.filter((p) => !slip.picks.some((q) => samePick(p, q))).length
}

export type MultiAddPlan = {
  /** In grid order (away digit, then home digit). */
  picks: SlipPick[]
  total: number
  perEnding: { min: number; max: number }
  lastStake: number
  /** Why Add is disabled, or null when it can go ahead. */
  blocked: string | null
}

/** What "Add N to slip" would do for these endings, stake mode and stake (multi-select spec §2). */
export function planMultiAdd(input: {
  slip: Slip
  gameId: string
  matchup: string
  endings: Ending[]
  mode: StakeMode
  stake: number
}): MultiAddPlan {
  const { slip, gameId, matchup, mode, stake } = input
  const endings = [...input.endings].sort((a, b) => a.awayDigit - b.awayDigit || a.homeDigit - b.homeDigit)
  const n = endings.length
  const empty = (blocked: string): MultiAddPlan => ({
    picks: [],
    total: mode === 'perEnding' ? stake * n : stake,
    perEnding: { min: 0, max: 0 },
    lastStake: slip.lastStake,
    blocked,
  })

  if (n === 0) return empty('Select at least one ending')
  if (!(stake > 0)) return empty('Enter a stake')
  if (mode === 'splitTotal' && stake < n) return empty('At least 1 pt per ending')
  if (stake > (mode === 'perEnding' ? MAX_STAKE : n * MAX_STAKE)) {
    return empty(`At most ${formatPoints(MAX_STAKE)} pts per ending`)
  }

  const stakes = mode === 'perEnding' ? endings.map(() => stake) : splitStake(stake, n)
  const picks = endings.map((e, i) => ({ gameId, matchup, ...e, stake: stakes[i] ?? 0 }))
  const min = Math.min(...stakes)
  const max = Math.max(...stakes)
  const room = slipRoom(slip)
  return {
    picks,
    total: stakes.reduce((sum, x) => sum + x, 0),
    perEnding: { min, max },
    lastStake: min,
    blocked: newPickCount(slip, picks) > room ? `The slip has room for ${room} more endings` : null,
  }
}
```

Add the reducer case (before `case 'clear'`):

```ts
    case 'addMany': {
      if (newPickCount(slip, action.picks) > slipRoom(slip)) return slip
      let next = slip
      for (const pick of action.picks) {
        const at = next.picks.findIndex((p) => samePick(p, pick))
        next =
          at >= 0
            ? updateAt(next, at, (next.picks[at]?.stake ?? 0) + pick.stake, false)
            : { ...next, picks: [...next.picks, { ...pick, stake: Math.min(MAX_STAKE, pick.stake) }] }
      }
      return { ...next, lastStake: action.lastStake >= 1 ? action.lastStake : slip.lastStake }
    }
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tests/unit/slip.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slip.ts tests/unit/slip.test.ts
git commit -m "feat: slip rules for adding several endings at once"
```

---

### Task 3: Multi-select mode on the heatmap

**Files:**
- Modify: `src/components/games/ending-heatmap.tsx`

**Interfaces:**
- Consumes: `endingKey` from `@/lib/slip`.
- Produces: `EndingHeatmap` props gain `selectedKeys?: ReadonlySet<string>` (keys from `endingKey`) and `onToggle?: (awayDigit: number, homeDigit: number) => void`. When `onToggle` is given it takes precedence over `onSelect`; `selected`, `winning`, `onSelect` and the read-only mode keep working for the admin drawer.

No unit test: the project has no component test environment (Vitest runs in node). Task 4's E2E covers the interaction.

- [ ] **Step 1: Implement**

Add imports: `import { Check } from 'lucide-react'` and `import { endingKey } from '@/lib/slip'`. Extend `Props`:

```ts
  /** Multi-select: keys from endingKey() that are currently selected. */
  selectedKeys?: ReadonlySet<string>
  /** Multi-select: tapping a cell toggles it. Takes precedence over onSelect. */
  onToggle?: (awayDigit: number, homeDigit: number) => void
```

In the cell body, replace the `isSelected` / button parts:

```tsx
                const isSelected = onToggle
                  ? (selectedKeys?.has(endingKey({ awayDigit: a, homeDigit: h })) ?? false)
                  : selected?.awayDigit === a && selected.homeDigit === h
                const onPress = onToggle ?? onSelect
                const className = cn(
                  'num relative flex size-8 items-center justify-center rounded-md',
                  SHADES[heatLevel(stake, max)],
                  isSelected && 'ring-foreground ring-2',
                  isWinning && 'ring-live ring-2',
                )
                return (
                  <td key={h} className="p-0">
                    {onPress ? (
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={isSelected}
                        onClick={() => onPress(a, h)}
                        className={className}
                      >
                        {stake > 0 ? compact(stake) : ''}
                        {onToggle && isSelected && (
                          <Check
                            aria-hidden
                            className="bg-foreground text-background absolute -top-1 -right-1 size-3 rounded-full p-px"
                          />
                        )}
                      </button>
                    ) : (
```

(the read-only `<span>` branch is unchanged). Destructure `selectedKeys, onToggle` in the function signature.

- [ ] **Step 2: Check types, lint and the admin drawer still compile**

Run: `npm run typecheck && npx eslint src/components/games/ending-heatmap.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/games/ending-heatmap.tsx
git commit -m "feat: multi-select mode for the ending heatmap"
```

---

### Task 4: The multi-add tray, wiring and E2E

**Files:**
- Create: `src/components/games/multi-add-tray.tsx`
- Modify: `src/components/bet-slip/slip-provider.tsx`
- Modify: `src/components/games/ending-picker.tsx`
- Test: `e2e/full-flow.spec.ts`

**Interfaces:**
- Consumes: `planMultiAdd`, `endingKey`, `parseStakeInput`, `QUICK_STAKES`, `type Ending`, `type StakeMode`, `type SlipPick` from `@/lib/slip`; `EndingHeatmap` `selectedKeys`/`onToggle` (Task 3).
- Produces: `useSlip().addMany(picks: SlipPick[], lastStake: number): void`; `<MultiAddTray gameId matchup endings onAdded onClear />`.

- [ ] **Step 1: Write the failing E2E steps**

In `e2e/full-flow.spec.ts`, after `await page.getByRole('button', { name: 'Add to slip', exact: true }).click()` and before the mobile `Open bet slip` line, insert:

```ts
  // then three more endings from the heatmap, splitting 300 across them
  await page.getByRole('tab', { name: 'Heatmap' }).click()
  for (const ending of ['0-0', '0-1', '0-2']) {
    await page.getByRole('button', { name: new RegExp(`^Ending ${ending},`) }).click()
  }
  await expect(page.getByText('3 endings selected')).toBeVisible()
  await page.getByRole('radio', { name: 'Split total' }).check()
  await page.getByLabel('Total stake').fill('300')
  await expect(page.getByText('300 split → 100 each')).toBeVisible()
  await page.getByRole('button', { name: 'Add 3 to slip' }).click()
  await expect(page.getByText('3 endings added to the slip')).toBeVisible()
```

Change `await expect(page.getByText('1 bet placed')).toBeVisible()` to `'4 bets placed'`, and the balance block to:

```ts
  // bob: 1000 top-up + 1000 matched + 100 daily - 400 staked + 540 (sole winner: 90% of a 600 pool)
  await page.goto('/wallet')
  await expect(page.getByTestId('balance')).toHaveText('2,240 pts')
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm run test:e2e`
Expected: FAIL — no "3 endings selected" text (the heatmap is still single-select).

- [ ] **Step 3: Add `addMany` to the slip provider**

In `src/components/bet-slip/slip-provider.tsx`, add to `SlipContextValue`:

```ts
  /** Adds several picks at once, or none if the slip lacks room (multi-select spec §2.4). */
  addMany: (picks: SlipPick[], lastStake: number) => void
```

and to the memoized value (no extra dependency needed — it only dispatches):

```ts
      addMany: (picks, lastStake) => {
        dispatch({ type: 'addMany', picks, lastStake })
        toast.success(`${picks.length} ${picks.length === 1 ? 'ending' : 'endings'} added to the slip`)
      },
```

- [ ] **Step 4: Create `src/components/games/multi-add-tray.tsx`**

```tsx
'use client'

import { useState } from 'react'

import { useSlip } from '@/components/bet-slip/slip-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPoints } from '@/lib/format'
import { type Ending, parseStakeInput, planMultiAdd, QUICK_STAKES, type StakeMode } from '@/lib/slip'

type Props = {
  gameId: string
  matchup: string
  endings: Ending[]
  /** Called after the picks went into the slip; the parent clears its selection. */
  onAdded: () => void
  onClear: () => void
}

/** Count, stake mode, one stake and "Add N to slip" for the selected heatmap cells (spec §2.2–2.4). */
export function MultiAddTray({ gameId, matchup, endings, onAdded, onClear }: Props) {
  const slip = useSlip()
  const n = endings.length
  const [mode, setMode] = useState<StakeMode>('perEnding')
  // null = follow the default for the mode (last stake, or last stake × n) until the player types.
  const [typed, setTyped] = useState<number | null>(null)
  const stake = typed ?? (mode === 'perEnding' ? slip.lastStake : slip.lastStake * n)
  const plan = planMultiAdd({
    slip: { picks: slip.picks, lastStake: slip.lastStake },
    gameId,
    matchup,
    endings,
    mode,
    stake,
  })
  const each =
    plan.perEnding.min === plan.perEnding.max
      ? formatPoints(plan.perEnding.min)
      : `${formatPoints(plan.perEnding.min)}–${formatPoints(plan.perEnding.max)}`
  const cost =
    mode === 'perEnding'
      ? `${n} × ${formatPoints(stake)} = ${formatPoints(stake * n)} pts`
      : `${formatPoints(stake)} split → ${each} each`

  return (
    <div className="bg-surface-2 border-border space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span role="status" aria-live="polite" className="text-sm font-medium">
          {n} {n === 1 ? 'ending' : 'endings'} selected
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>

      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Stake mode</legend>
        {(
          [
            ['perEnding', 'Per ending'],
            ['splitTotal', 'Split total'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="stake-mode"
              value={value}
              checked={mode === value}
              onChange={() => {
                setMode(value)
                setTyped(null)
              }}
              className="accent-primary size-4"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={mode === 'perEnding' ? 'Stake per ending' : 'Total stake'}
          className="num h-9 w-28"
          value={stake === 0 ? '' : stake}
          onChange={(e) => setTyped(parseStakeInput(e.target.value))}
        />
        {QUICK_STAKES.map((amount) => (
          <Button
            key={amount}
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Add ${amount} to the stake`}
            onClick={() => setTyped(stake + amount)}
          >
            +{amount}
          </Button>
        ))}
      </div>

      <p className="num text-muted-foreground text-sm">{cost}</p>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={plan.blocked !== null}
        onClick={() => {
          slip.addMany(plan.picks, plan.lastStake)
          onAdded()
        }}
      >
        Add {n} to slip
      </Button>
      {plan.blocked && <p className="text-muted-foreground text-center text-xs">{plan.blocked}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Wire it into `src/components/games/ending-picker.tsx`**

Add imports: `import { type Ending, endingKey } from '@/lib/slip'` and `import { MultiAddTray } from './multi-add-tray'`. Inside the component, add state and derived values:

```tsx
  const [tab, setTab] = useState<'pickers' | 'heatmap'>('pickers')
  const [multi, setMulti] = useState<Map<string, Ending>>(new Map())
  const [lastTapped, setLastTapped] = useState<Ending | null>(null)
  const selectedKeys = open ? new Set(multi.keys()) : new Set<string>()
  const toggle = (awayDigit: number, homeDigit: number) => {
    const e = { awayDigit, homeDigit }
    setMulti((prev) => {
      const next = new Map(prev)
      if (next.has(endingKey(e))) next.delete(endingKey(e))
      else next.set(endingKey(e), e)
      return next
    })
    setLastTapped(e)
  }
  const clearMulti = () => {
    setMulti(new Map())
    setLastTapped(null)
  }
  const pickerSelected = away !== null && home !== null ? { awayDigit: away, homeDigit: home } : null
  const selected = tab === 'heatmap' ? (selectedKeys.size > 0 ? lastTapped : null) : pickerSelected
```

Replace the old `const selected = ...` line with the above (`endingStake` keeps using `selected`). Make the tabs controlled: `<Tabs value={tab} onValueChange={(v) => setTab(v === 'heatmap' ? 'heatmap' : 'pickers')}>`. Replace the heatmap's `selected`/`onSelect` props with:

```tsx
          <EndingHeatmap
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            cells={cells}
            selectedKeys={selectedKeys}
            onToggle={open ? toggle : undefined}
          />
```

Wrap the existing Add to slip `<Button>` and the "Adds at your last stake" `<p>` so they render only when `tab === 'pickers' || !open`, and add the tray for the heatmap tab, placed directly after `</Tabs>` (before the "Selected ending" panel):

```tsx
      {tab === 'heatmap' && open && selectedKeys.size > 0 && (
        <MultiAddTray
          gameId={gameId}
          matchup={`${awayTeam} @ ${homeTeam}`}
          endings={[...multi.values()]}
          onAdded={clearMulti}
          onClear={clearMulti}
        />
      )}
```

The Add to slip button's `onClick` uses `pickerSelected` instead of `selected`, and its `disabled` is `!open || !pickerSelected`.

- [ ] **Step 6: Run everything**

Run: `npm run check && npm run test:e2e`
Expected: check passes (format, lint, typecheck, all Vitest suites); E2E 2 passed (desktop and iPhone).

- [ ] **Step 7: Check it by hand on a phone-width viewport**

Run the dev server (`npm run dev`), open an open game at 375 px width, Heatmap tab:
tap a cell twice (it deselects), select 6 cells, switch modes (stake resets to last stake / last stake × 6), type 5 in Split total (button disabled, "At least 1 pt per ending"), Clear (tray disappears). Confirm the grid does not scroll horizontally at 375 px.

- [ ] **Step 8: Commit**

```bash
git add src/components/games/multi-add-tray.tsx src/components/games/ending-picker.tsx src/components/bet-slip/slip-provider.tsx e2e/full-flow.spec.ts
git commit -m "feat: add several heatmap endings to the slip at once"
```

---

### Finish

- [ ] `npm run check` and `npm run test:e2e` pass on the branch.
- [ ] Push `feat/multi-select-heatmap`, open a PR with no AI attribution, squash-merge after review, then `npm run build && systemctl --user restart lastdigit`.
