# Multi-select heatmap: bet several endings at once

Date: 2026-11-13 · Status: approved design, awaiting spec review

## 1. Goal

Make it quick to bet on several endings of one game. Today every ending costs three taps (away digit,
home digit, Add to slip) and goes in at the last stake, so ten endings take about thirty taps.

**Success:** a player selects any set of cells on a game's heatmap, chooses how to stake them, and
adds them all to the slip in one tap; the slip can hold up to 100 picks and confirms them in one
all-or-nothing transaction, as today.

**Decided with the product owner:**

- Selection is by tapping several heatmap cells (not digit crosses, whole rows or preset patterns).
- The player chooses the stake mode: the same stake per ending, or one total split across them.
- The slip limit rises from 20 to 100 picks.
- Approach A: the heatmap becomes multi-select with a tray under it (not add-on-tap, not a separate
  Single/Multi mode).

**Out of scope:** row/column/pattern shortcuts, multi-select in the Pickers tab, picking across
several games at once, grouping slip rows by game, any change to payouts or settlement.

## 2. Player experience

### 2.1 Selecting cells

- On an open game, the Heatmap tab's cells toggle on tap. A selected cell shows a ring and a check
  mark; its accessible name ends in ", selected" and it carries `aria-pressed="true"`.
- On a closed game the heatmap stays read-only, as today.
- The selection is local UI state: it is not saved and is cleared when the player leaves the page.
- The Pickers tab is unchanged: one ending at a time through Add to slip.

### 2.2 The tray

Shown under the heatmap while at least one cell is selected:

| Element         | Behavior                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| Count           | "N endings selected", with a **Clear** button that empties the selection                  |
| Mode toggle     | **Per ending** (default) / **Split total**                                                |
| Stake input     | One whole-number field plus the existing 10 / 50 / 100 quick-add buttons                  |
| Cost line       | Per ending: "6 × 100 = 600 pts". Split total: "600 split → 100 each" (or "→ 100–101 each") |
| **Add N to slip** | Adds every selected ending, then clears the selection                                   |

- The stake input starts at the slip's last stake in Per ending mode. Switching to Split total sets
  it to last stake × N; switching back sets it to last stake. Editing the input after that is kept
  until the next switch.
- The stake is clamped to [0, MAX_STAKE] per ending, using the existing `parseStakeInput`.

### 2.3 Blocked states

The **Add N to slip** button is disabled, with a one-line hint under it, when:

- the stake is 0 → "Enter a stake";
- Split total and the total is smaller than N → "At least 1 pt per ending";
- Split total and the total exceeds N × MAX_STAKE → "At most {MAX_STAKE} pts per ending";
- the selection would push the slip past 100 picks → "The slip has room for X more endings".

Adding never half-succeeds: either every selected ending goes into the slip or none does. Balance is
not checked here; the slip already shows its total and the server rejects what the player cannot
afford, as today.

### 2.4 After adding

- Every selected ending is added to the slip for this game. An ending already in the slip gets the
  new stake added to its existing stake (same as single Add to slip today) and does not use up room.
- The selection clears and a toast says "N endings added to the slip".
- The slip's last stake becomes the per-ending stake (Per ending), or the smallest per-ending share
  (Split total).

### 2.5 Layout

- On the Heatmap tab the tray replaces the single **Add to slip** button. The "Selected ending"
  panel stays and describes the most recently tapped cell (its stake and est. payout per 100);
  it shows "–" when nothing is selected. The Pickers tab keeps the panel and button as today.
- Phone: the tray sits directly under the grid, then the panel; the slip bar keeps floating above
  the tab bar.
- Desktop: same order in the game column; the slip stays in the right column.
- The grid keeps its 10 × 10 layout and 32 px cells.

## 3. Rules

### 3.1 Splitting a total

`splitStake(total, n)` returns n whole-number stakes that sum to `total`: each gets
`floor(total / n)`, and the first `total mod n` endings get one more. Endings are ordered by away
digit, then home digit (grid reading order). Example: 100 over 6 endings → 17, 17, 17, 17, 16, 16.
It requires `n ≥ 1` and `total ≥ n`.

### 3.2 Slip limit

`MAX_SLIP_PICKS` becomes 100. It drives the client slip (`canAdd`, `addMany`, stored-slip schema)
and the server (`placeBetsSchema`, the slip status query), as it does today.

## 4. Code changes

| File                                          | Change                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/game/limits.ts`                      | `MAX_SLIP_PICKS = 100`                                                                                                                                                                                                                                                                            |
| `src/lib/slip.ts`                             | `splitStake(total, n)`; `slipRoom(slip, picks)` = MAX_SLIP_PICKS minus picks already held, counting only endings not yet in the slip; reducer action `{ type: 'addMany', picks: SlipPick[], lastStake: number }` that merges or appends every pick, or returns the slip unchanged if room is short |
| `src/components/bet-slip/slip-provider.tsx`   | `addMany(picks, lastStake)` on the context, with the success toast; the single-add "slip is full" toast uses the new limit                                                                                                                                                                         |
| `src/components/games/ending-heatmap.tsx`     | Optional `selectedSet` (set of "a-h" keys) and `onToggle(a, h)` for multi-select; the existing `selected`/`winning`/read-only modes keep working for other callers                                                                                                                                  |
| `src/components/games/multi-add-tray.tsx` (new) | The tray in §2.2–2.3; pure props in, `onAdd(picks, lastStake)` out                                                                                                                                                                                                                                 |
| `src/components/games/ending-picker.tsx`      | Holds the selection set for the Heatmap tab and renders `MultiAddTray`; the Pickers tab is unchanged                                                                                                                                                                                              |
| `src/server/bets.ts`                          | `placeBets` transaction gets `{ timeout: 30_000 }` (100 picks ≈ 300 writes, beyond Prisma's 5 s default)                                                                                                                                                                                          |

No schema change and no migration. When building the tray and the toggling grid, consult the
`modern-web-guidance` skill (toggle buttons, segmented control, live counts) per `CLAUDE.md`.

## 5. Errors and edge cases

- **Game closes while cells are selected:** the page refreshes at tip-off (existing `Countdown`),
  the grid turns read-only and the selection is dropped. Picks already in the slip are flagged by
  the existing slip status check.
- **Slip changes in another tab:** room is computed from the current slip at tap time; `addMany`
  re-checks room in the reducer, so a stale count cannot overfill it.
- **Server rejects a pick** (balance, stake limit, closed game): unchanged — the slip keeps all
  picks, highlights the failing one and shows the error.

## 6. Testing

- **Unit (`tests/unit`)**
  - `splitStake`: even split, remainder order, n = 1, total = n, total < n rejected.
  - `slipRoom` and `addMany`: append new endings; merge into existing ones without using room;
    all-or-nothing when room is short; last stake updated; 100-pick cap.
  - Stored-slip parsing accepts 100 picks and rejects 101.
- **Integration (`tests/integration`)**
  - `placeBets` with 100 picks on one game succeeds within the timeout and keeps the ledger
    consistent; 101 picks are rejected by validation and nothing is written.
- **E2E (`e2e/full-flow.spec.ts`, desktop and iPhone)**
  - On the game page's Heatmap tab, select three cells, switch to Split total, enter 300, add →
    the slip holds three picks of 100 → confirm → "3 bets placed".
