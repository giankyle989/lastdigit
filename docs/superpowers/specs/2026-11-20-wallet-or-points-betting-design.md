# Wallet or points betting, with separate labels — design

Date: 2026-11-20. Builds on `2026-11-18-wallet-and-points-design.md`.

## 1. Goal

Players can tell their two balances apart everywhere, and they choose which one pays for a bet.

- **Wallet**: cashable money, shown in pesos: `₱1,240`.
- **Points**: bonus balance, bet-only, shown in pts: `40 pts`.
- **Pools** (stakes from both, mixed): plain numbers: `1,240`.

Today every stake is paid from points first, then the wallet (`splitStake` in
`src/lib/funding.ts`), and both balances are shown in "pts", with the header showing one total.

### Decisions (from the user)

| Question                                   | Decision                                          |
| ------------------------------------------ | ------------------------------------------------- |
| Labels                                     | Wallet in ₱, points in pts                        |
| Where the player chooses                   | Once per slip                                     |
| Chosen balance can't cover the slip        | Block and say so; never top up from the other one |
| Label for pools and heatmap (mixed stakes) | No unit                                           |

### Assumptions

- 1 wallet unit = ₱1. No conversion; amounts stay whole numbers.
- Winnings keep today's rule (`splitReturn`): the points part of a bet's stake comes back as
  points; the wallet stake and **all profit** go to the wallet.

### Out of scope

Choosing per pick; changing how winnings are paid; currency conversion; schema changes.

## 2. Betting rule (server)

### Input

`placeBets(userId, account, picks, now)` takes `account: 'WALLET' | 'POINTS'` as its own
argument (required, validated with zod) and `picks: { gameId, awayDigit, homeDigit, stake }[]`.
`placeBet(userId, account, pick, now)` (single) passes its `account` the same way.
`placeBetsAction(account, picks)` forwards the slip's account.

### Placing

Under the existing locks (games, then the user row):

1. All existing checks run unchanged: suspension, staff, betting closed, stake limit, the
   20-endings-per-game limit.
2. `available` = the chosen balance, with a negative balance counted as 0.
3. If the slip total is more than `available`, throw `INSUFFICIENT_BALANCE` with a message naming
   the account and its balance, e.g. `Not enough points (40 pts)` or
   `Not enough in the wallet (₱25)`. Nothing is posted. The other balance is never read for
   funding.
4. Each stake posts one `BET` ledger entry to the chosen account (`postEntry`, unchanged).
5. Each bet row's `pointsStake` grows by the stake on a points slip, and is unchanged on a wallet
   slip.

`splitStake` (points first) is removed; nothing else uses it.

### Same ending, two slips

Bets on the same ending still merge into one `Bet` row (`@@unique([userId, gameId, awayDigit,
homeDigit])`). If one slip paid from the wallet and another from points, the row holds both:
`pointsStake` is the points part and `stake - pointsStake` the wallet part. Settlement and void
already split a row by `pointsStake` (`splitReturn`, per-account reversal), so they need no change.
Tests must pin this.

### Slip status

`getSlipStatusAction` already returns `walletBalance` and `pointsBalance`; no change.

## 3. Bet slip (client)

- **State**: `Slip` gains `account: 'WALLET' | 'POINTS' | null`. `null` means "not chosen yet". It
  is persisted with the slip in localStorage. `parseStoredSlip` accepts only the two values, and
  anything else becomes `null`.
- **Default**: when `account` is `null`, the slip uses Points if the points balance is above 0,
  otherwise Wallet. Choosing a side stores it.
- **"Pay from" toggle** at the top of the slip:

  ```
  Pay from   [ Wallet ₱700 ]  [ Points 40 pts ]
  ```

  It is a radio group (one choice, keyboard operable), labelled "Pay from".
- **Totals**: "Total stake" uses the chosen unit (`₱100` or `100 pts`).
- **Return lines** ("Est. return if it hits" and "Est. max return"):
  - Wallet slip: one ₱ figure, e.g. `₱310`.
  - Points slip: the stake comes back as points and the rest is ₱, wallet first: `₱210 + 100 pts`. The ₱ part
    is the estimate minus the stake; when the estimate is at or below the stake, show only the pts
    part.
- **Not enough**: if the total is more than the chosen balance, the slip shows
  `Not enough points (40 pts).` If the other balance can cover it, it adds
  ` Pay from Wallet instead?` as a button that switches. **Confirm bets** is disabled.
- **Removed**: the "Uses 40 points + 60 wallet" line (`fundingLine`, testid `slip-funding`).
- Quick stake buttons and stake inputs show plain numbers.
- The per-pick maximum (`maxStakeFor`) uses the chosen balance, not the total of both.

## 4. Labels across the app

### Formatting

In `src/lib/format.ts`:

- `formatWallet(n)` → `₱1,240` (negative: `-₱25`)
- `formatPts(n)` → `40 pts`
- `formatPool(n)` → `1,240`

A component `<Amount kind="wallet" | "points" | "pool" value={n} />` replaces `PointsAmount`. It
keeps its current visual role (tabular figures, optional sign).

### Screens

| Screen                                                | Change                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player header                                         | Two figures in the `/wallet` link: `₱140 · 40 pts`. Accessible name `₱140 · 40 pts (wallet ₱140, points 40 pts)` (the visible text starts the name, WCAG 2.5.3).                          |
| Wallet page                                           | Wallet card in ₱, points card in pts. Each history row is in its own account's unit.                                                                                  |
| My Bets                                               | Stake shows what paid: `₱100`, `40 pts`, or `₱60 + 40 pts` for a merged row. Payout and refund in the units they were paid in (payout: `₱210 + 40 pts` style when points were staked). |
| Game page, game cards, heatmap, ending picker, multi-add tray | Pools and ending totals: no unit. A player's own stake on an ending: per its account, as on My Bets.                                                          |
| Referral page                                         | Bonus amounts keep the unit of the account they credit (welcome and referral bonuses are points: pts).                                                               |
| Support new-ticket form                               | Cash out hint: `Wallet: ₱700 available. Points can't be cashed out.`                                                                                                  |
| Admin: players list and player drawer                 | Wallet in ₱, points in pts. The balance dialogs show the unit of the account they change.                                                                             |
| Admin: ledger                                         | Each row in its account's unit.                                                                                                                                       |
| Admin: support ticket drawer                          | Cash in / out amounts and the wallet hint in ₱.                                                                                                                       |
| Admin: dashboard, games list, game drawer             | Wallet totals in ₱, points totals in pts, pools and stakes per game with no unit.                                                                                     |

Every file that uses `PointsAmount` or `formatPoints` is reviewed. A value whose account is
unclear is a pool (no unit).

## 5. Errors

- `INSUFFICIENT_BALANCE` message names the chosen account (see §2). The slip shows it inline, as
  it does for other placement errors.
- Missing or invalid `account` → zod validation error (`VALIDATION`). An old client without
  `account` is refused rather than guessed.

## 6. Testing

- **Integration** (`tests/integration/place-bets.test.ts`, real Postgres):
  - points slip: only points move; `pointsStake` = stake;
  - wallet slip: only the wallet moves; `pointsStake` = 0;
  - points too low while the wallet is plenty → `INSUFFICIENT_BALANCE`, nothing posted (and the
    reverse);
  - a negative chosen balance counts as 0;
  - missing `account` → validation error;
  - wallet slip, then points slip on the same ending → one row with a mixed `pointsStake`; then
    settle as a win (points back to points, rest to wallet) and void (each account refunded its
    own part), with `expectLedgerConsistent()`.
- **Unit**:
  - `formatWallet`, `formatPts`, `formatPool`;
  - slip: default account; stored `account` parsing; sufficiency check against the chosen balance;
    `maxStakeFor` with the chosen balance; points-slip return split.
- **E2E** (`e2e/wallet.spec.ts`):
  - the header shows `₱` and `pts` separately;
  - a slip paid from Points, then one from Wallet; each balance moves on its own;
  - choosing Points with too few points disables Confirm and offers Wallet.
