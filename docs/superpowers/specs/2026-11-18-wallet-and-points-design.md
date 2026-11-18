# Wallet and points: two balances

Date: 2026-11-18 · Status: design approved in chat, awaiting spec review

## 1. Goal

Separate money a player can cash out from bonus credit that can only be bet, so bonuses can't be
cashed out directly and staff can grant and take each one on its own.

**Decided with the product owner:**

- Two balances per player:
  - **Wallet:** top-ups and winnings. Can be cashed out.
  - **Points:** bonus credit. Can only be bet.
- **Bets** spend points first, then the wallet.
- **Wins:** the points part of the stake goes back to points. The rest of the payout (the wallet
  part of the stake plus all profit) goes to the wallet.
- **Refunds** go back to whichever balance paid.
- **Staff** with `points.adjust` (managers and superadmin) have four choices:
  - cash in (wallet +);
  - cash out (wallet −);
  - give points (points +);
  - take points (points −).
- **Both grants** (cash in and give points) need a confirmed phone. Deductions are never blocked by
  the phone check.
- **Bonuses** (welcome, referral, daily) are paid as points.
- **Existing balances** move into the wallet.

**Out of scope:**

- the player choosing which balance a bet uses;
- wagering requirements or expiry on points;
- player-initiated cash-out requests (cash out stays a staff action, usually after a support
  ticket);
- converting points to wallet any other way than winning.

## 2. Data model

One migration, written by hand so Prisma doesn't drop and re-add the column.

```sql
CREATE TYPE "Account" AS ENUM ('WALLET', 'POINTS');
ALTER TABLE "User" RENAME COLUMN "balance" TO "walletBalance";
ALTER TABLE "User" ADD COLUMN "pointsBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "account" "Account" NOT NULL DEFAULT 'WALLET';
ALTER TABLE "Bet" ADD COLUMN "pointsStake" INTEGER NOT NULL DEFAULT 0;
```

- **`User`:**
  - `walletBalance Int @default(0)` holds what `balance` held, so today's balances land in the
    wallet with no data copied.
  - `pointsBalance Int @default(0)` is new.
- **`Transaction.account`:** says which balance the row changed. `balanceAfter` is that balance
  after the row. Every existing row becomes `WALLET`, which matches where its money now sits.
- **`Bet.pointsStake`:** the part of `stake` that points paid. The wallet paid
  `stake − pointsStake`. Always `0 ≤ pointsStake ≤ stake`. Existing bets get 0.
- `TransactionType` is unchanged. Admin rows keep `ADMIN_GRANT` / `ADMIN_DEDUCT`, and `account`
  tells cash in from give points.

## 3. Ledger

`postEntry(tx, entry, opts)` stays the only way either balance changes.

- `LedgerEntry` gains a required `account: Account`.
- The update, the `requireFunds` check and `balanceAfter` all use that account's column. The
  column name comes from a fixed map (`WALLET → walletBalance`, `POINTS → pointsBalance`), never
  from input.
- `INSUFFICIENT_BALANCE`'s message names the account:
  - "Not enough in the wallet";
  - "Not enough points".
- CLAUDE.md hard rule 1 becomes "`User.walletBalance` and `User.pointsBalance` change only through
  `postEntry()`".

A pure helper in `src/lib/funding.ts` holds the split rules:

- `splitStake(stake, pointsAvailable) → { points, wallet }`:
  - `points = min(stake, max(0, pointsAvailable))`;
  - `wallet = stake − points`.
- `splitReturn(amount, pointsStake) → { points, wallet }`, used for a payout or a refund:
  - `points = min(amount, pointsStake)`;
  - `wallet = amount − points`.
  - A payout is never less than the stake and a refund is the stake, so in practice
    `points = pointsStake`. The `min` only guards against bad input.

## 4. Placing bets

`placeBets` keeps its one transaction, game locks and per-pick errors.

1. Lock the player's row `FOR UPDATE` before the game locks. The order is user, then games, the
   same in every slip, so no deadlock. Read both balances.
2. **Up-front check:** the slip's total stake must not exceed `walletBalance + pointsBalance`.
   Otherwise fail with `INSUFFICIENT_BALANCE` "Not enough balance". With more than one pick, the
   error points at the first pick that doesn't fit.
3. **Each pick, in order:**
   - work out `{ points, wallet } = splitStake(stake, pointsLeft)`;
   - upsert the bet, incrementing `stake` by `stake` and `pointsStake` by `points`;
   - post `BET` −points on `POINTS` (if > 0) and `BET` −wallet on `WALLET` (if > 0), both with
     `requireFunds`;
   - decrease `pointsLeft`.
4. Stake limits, closed games and the 100-pick cap are unchanged.

Because the row is locked, two slips sent at once can't spend the same points twice. The second
one waits and then sees the lower balances.

## 5. Settlement and void

- **Refund** (SOLO, NO_WINNER, NO_LOSERS):
  - `splitReturn(bet.stake, bet.pointsStake)`;
  - one `REFUND` row per non-zero part, on its account, with the same note as today.
- **Win:**
  - `splitReturn(payout, bet.pointsStake)`;
  - one `PAYOUT` row per non-zero part.
  - The points part is the points stake coming back. The wallet part is the wallet stake plus
    all profit.
- **Lose:** nothing posted (unchanged).
- **Void:**
  - Every `PAYOUT` row the bet has is reversed on its own account with a "Payout reversal"
    `REFUND` row, as today, per account.
  - The stake is refunded with `splitReturn(bet.stake, bet.pointsStake)`.
  - The net change per account is zero for a won bet and the original stake for a lost one.
  - No `requireFunds`, as today, so a reversal can leave a balance negative. That shows on the
    overview.
- Lock order is unchanged (`lockUsers`, ascending id).

## 6. Bonuses

| Bonus    | When                                  | Paid to |
| -------- | ------------------------------------- | ------- |
| Welcome  | first cash in, matched up to the cap  | points  |
| Referral | referred player's first cash in       | points  |
| Daily    | claimed once per PHT day              | points  |

- **"First cash in":** no earlier `ADMIN_GRANT` row on `WALLET` exists. Existing grant rows become
  `WALLET` in the migration, so a player who already topped up never gets a second welcome bonus.
- **Give points** never triggers the welcome or referral bonus.
- **Copy:**
  - the daily bonus text reads "Claim N free points once a day" (unchanged);
  - the referral page says the referrer earns bonus points.

## 7. Staff: adjusting balances

`adjustPoints` is renamed `adjustBalance(adminId, userId, input)`. It still asserts
`points.adjust` first.

**Input (zod):**

- `kind: 'CASH_IN' | 'CASH_OUT' | 'GIVE_POINTS' | 'TAKE_POINTS'`;
- `amount` (1..`MAX_GRANT`, as today);
- `note` (required, 1..500 characters).

| Kind        | Account | Entry            | Phone confirmed | Funds check | Audit action    |
| ----------- | ------- | ---------------- | --------------- | ----------- | --------------- |
| CASH_IN     | WALLET  | `ADMIN_GRANT` +  | required        | –           | `CASH_IN`       |
| CASH_OUT    | WALLET  | `ADMIN_DEDUCT` − | –               | wallet ≥ 0  | `CASH_OUT`      |
| GIVE_POINTS | POINTS  | `ADMIN_GRANT` +  | required        | –           | `GRANT_POINTS`  |
| TAKE_POINTS | POINTS  | `ADMIN_DEDUCT` − | –               | points ≥ 0  | `DEDUCT_POINTS` |

- `CASH_IN` runs the welcome and referral logic from §6. Everything else returns zero bonuses.
- **Audit:** `CASH_IN` and `CASH_OUT` are new audit actions. Older `GRANT_POINTS` and
  `DEDUCT_POINTS` rows (from before this change) were single-balance top-ups and deductions.
  They keep their label.
- **Action:** `adjustBalanceAction` replaces `adjustPointsAction` and keeps
  `requireAdmin('points.adjust')`. The toast says what happened:
  - "Cash in recorded (+500 welcome bonus points)";
  - "Cash out recorded";
  - "Points given";
  - "Points taken".

## 8. Screens

**Player:**

- **Header:** shows the total available (`walletBalance + pointsBalance`). Its accessible label
  spells out both, e.g. "Balance: 1,200 (wallet 700, points 500)".
- **Wallet page:**
  - Two cards replace the single balance card:
    - **Wallet:** "Can be cashed out";
    - **Points:** "Bonus credit, for betting only".
  - Each transaction row shows a small `Wallet` / `Points` tag and that account's
    `balanceAfter`.
  - A bet or win paid from both balances shows as two rows.
  - Filter chips are unchanged.
- **Bet slip:**
  - "Available" is the total.
  - Under it, while picks are staked, a line says how the stake will be paid, e.g. "Uses 500
    points + 200 wallet".
  - Max and the over-balance check use the total.
  - `getSlipStatus` returns `walletBalance` and `pointsBalance`.

**Admin:**

- **Players table:**
  - Wallet and Points columns, both sortable (`wallet`, `points`).
  - Old `?sort=balance` links fall back to the default sort.
- **Player drawer:**
  - Shows both balances.
  - The adjust form has a four-option choice (Cash in, Cash out, Give points, Take points)
    instead of Grant/Deduct.
  - Cash in and Give points are disabled until the phone is confirmed, with the existing hint.
  - Transactions show the account.
- **Ledger page:**
  - an Account column;
  - an Account filter (All, Wallet, Points);
  - the total for the filter as today.
- **Overview:** "Needs attention" lists players with a negative wallet *or* negative points,
  naming which.

## 9. Errors and edge cases

- **Slip larger than both balances together:** refused, nothing placed.
- **Cash out more than the wallet holds:** "Not enough in the wallet", nothing changes, even if
  points would cover it.
- **Take more points than the player has:** "Not enough points".
- **Points are 0:** bets come wholly from the wallet, and `pointsStake` stays 0.
- **Repeat bet on the same ending:** the bet keeps one row. `stake` and `pointsStake` both grow,
  so a later refund or win still returns each part to its source.
- **Void after a win:** the payout is reversed per account, then the stake is refunded per
  account. Points and wallet each end where they would have been without the game.
- **Staff accounts** have no balances to adjust (unchanged: `requirePlayer`).

## 10. Code changes

| File                                               | Change                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `prisma/schema.prisma` + migration                 | `Account` enum, `walletBalance`, `pointsBalance`, `account`, `pointsStake` |
| `src/lib/funding.ts` (new)                         | `splitStake`, `splitReturn`                                        |
| `src/lib/wallet.ts`                                | account labels                                                    |
| `src/server/ledger.ts`                             | `account` on entries                                              |
| `src/server/bets.ts`                               | user lock, up-front total check, split funding                    |
| `src/server/settlement.ts`                         | split payout, refund and void                                     |
| `src/server/bonuses.ts`                            | daily bonus to points                                             |
| `src/server/admin/players.ts`                      | `adjustBalance`, bonuses to points                                |
| `src/server/audit.ts`                              | `CASH_IN`, `CASH_OUT`                                             |
| `src/server/queries/player.ts`                     | slip status and transactions with both balances and account      |
| `src/server/admin/overview.ts`, `admin/tables/players.ts`, `admin/tables/ledger.ts` | both balances, account column and filter |
| `src/app/admin/actions.ts`, `players/*`, `ledger/page.tsx`, `page.tsx` | adjust form and displays                       |
| `src/app/(player)/layout.tsx`, `wallet/page.tsx`, `more/referral/page.tsx` | header total, two cards, copy                |
| `src/components/shell/player-header.tsx`, `bet-slip/*`, `src/lib/slip.ts` | total and funding line                      |
| `CLAUDE.md`, `README.md`                           | hard rule 1 wording; deploy steps                                 |
| tests                                              | `balance` → the new fields; new tests below                       |

## 11. Testing

- **Unit:**
  - `splitStake`: points 0, partial and enough; negative points treated as 0.
  - `splitReturn`: payout above the stake; refund equal to the stake; `pointsStake` 0.
  - The slip's funding line.
- **Integration (real Postgres):**
  - **Betting:**
    - a pick paid fully by points, fully by wallet, and by both (two `BET` rows, correct
      `pointsStake`);
    - a slip that crosses from points to wallet partway;
    - a repeat bet on one ending;
    - a slip larger than the total is refused;
    - two concurrent slips can't overspend.
  - **Settlement and void:**
    - a mixed bet wins: points get back `pointsStake`, the wallet gets the rest;
    - a mixed bet is refunded: each part goes back to its source;
    - void after a win: both balances net back.
  - **Staff:**
    - all four kinds;
    - phone required for both grants;
    - cash out can't touch points;
    - welcome and referral bonuses land in points on the first cash in only;
    - give points triggers no bonus;
    - a player whose old grant row exists gets no welcome bonus.
  - **Bonuses:** the daily bonus lands in points.
  - **Migration:** applying it to a copy with a balance keeps that amount in `walletBalance`.
- **E2E (desktop and iPhone):**
  - staff cash in → the player sees wallet and welcome points;
  - the player bets more than their points → the wallet page shows both balances reduced and
    two bet rows;
  - staff take points.

## 12. Deploy

This is the same as admin levels, and README gets an "Upgrading to wallet and points" section:

1. `pg_dump` the live database.
2. `npm run build`.
3. `npx prisma migrate deploy`.
4. `systemctl --user restart lastdigit`.

Run steps 2–4 together: the old build reads `balance`, which no longer exists after the
migration.

**Rollback** (before any points activity):

```sql
ALTER TABLE "User" DROP COLUMN "pointsBalance";
ALTER TABLE "User" RENAME COLUMN "walletBalance" TO "balance";
ALTER TABLE "Transaction" DROP COLUMN "account";
ALTER TABLE "Bet" DROP COLUMN "pointsStake";
DROP TYPE "Account";
DELETE FROM "_prisma_migrations" WHERE migration_name LIKE '%_wallet_and_points';
```

Then deploy the previous build.

After points have been used, a rollback must first add each player's `pointsBalance` into
`walletBalance`.
