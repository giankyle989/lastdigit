# LastDigit — Design Spec

**Date:** 2026-11-11
**Status:** Approved design, pending spec review

## 1. Summary

LastDigit is a free-to-play web game where players bet points on the **last digit of each team's final score** in NBA games. Example: LAL 99 @ GSW 106 → ending **9-6**. All stakes on a game form a pool; winners split 90% of it proportionally to their stake; the house keeps 10%.

Points have **no monetary value**. They cannot be bought or withdrawn. They enter the system only via referral bonuses and admin grants.

## 2. Users and goals

- **Player:** signs up, places bets on upcoming games, tracks bets and balance, refers friends, contacts support.
- **Admin:** manages players (info, referrals, points, restrictions), monitors the points ledger, answers inquiries, handles game exceptions.

## 3. Architecture

- **Single Next.js app** (App Router, TypeScript), **PostgreSQL** via **Prisma**.
  - `/` — player site.
  - `/admin` — admin panel; restricted to `role = ADMIN` (enforced in middleware and in every admin server action/route).
- **Auth:** Auth.js credentials provider, username + password, bcrypt hashes, session includes `userId`, `role`.
- **Sync job:** endpoint `/api/cron/sync` protected by a `CRON_SECRET` header, triggered every 5 minutes (Vercel Cron or system cron). It:
  1. Fetches games from the **balldontlie API** for yesterday, today, and the next 7 days (US Eastern dates).
  2. Upserts games by `externalId`; updates scores and status.
  3. Settles every game with status `FINAL`.
- **Validation:** zod schemas on all server inputs.

## 4. Game rules

### 4.1 Ending
- Ending = (last digit of away final score, last digit of home final score), **overtime included**.
- Always written and displayed **away-home**, matching the matchup display "AWAY @ HOME".
- 100 possible endings: 0-0 … 9-9.

### 4.2 Betting
- A player may bet on **multiple endings** per game.
- Betting on an ending the player already bet on for that game **adds to the existing bet's stake** (one `Bet` row per user/game/ending).
- Stake: positive integer points.
- Betting closes at the game's scheduled `startsAt` (tip-off). Server time is authoritative.
- Bet is rejected if: game not `SCHEDULED` or `now >= startsAt`; account suspended; insufficient balance; total stake on the game would exceed the player's `stakeLimitPerGame` (if set).
- Bets cannot be cancelled by the player.

### 4.3 Settlement (automatic)
When a game reaches `FINAL`:
- `pool` = sum of all stakes on the game.
- **Winners** = bets whose ending equals the final ending.
- If winners exist:
  - `payoutPool = floor(pool × 0.90)`.
  - Each winning bet gets `floor(payoutPool × bet.stake / totalWinningStake)`.
  - `houseTake = pool − sum(payouts)` (10% plus rounding remainder).
- If no winners: `houseTake = pool`, all bets `LOST`.
- Winning bets → `WON`, others → `LOST`. A `PAYOUT` transaction is written per winning bet.
- Game status → `SETTLED`, `settledAt` set.
- A game with no bets settles with `pool = 0`, `houseTake = 0`.

### 4.4 Void
- Admin may void a game in any status except `VOID`, with a required reason.
- Every bet gets a `REFUND` transaction of its stake; bets → `REFUNDED`.
- If the game was already settled, each payout is reversed with a negative `REFUND`-typed reversal transaction (note: "payout reversal"), and `houseTake` is reset to 0.
- A reversal may drive a balance negative; such players are flagged on the admin dashboard. Negative-balance players cannot bet until their balance covers the stake (normal balance check).
- Games the API reports as postponed/cancelled are never settled automatically; they are flagged on the admin Games page for voiding.

### 4.5 Points sources
- **Referral bonus:** when a new player signs up with a valid referral code, the referrer receives `referralBonus` points (admin-configurable setting; default 500). The new player receives nothing.
- **Admin grant/deduct:** admin adds or removes points with a required note.
- New players without a referral start at 0.

### 4.6 Restrictions
- **Suspend:** blocks login and all actions; optional `suspendedUntil` (null = indefinite). Expired suspensions are treated as active accounts. Existing sessions are rejected at the next request.
- **Stake limit:** `stakeLimitPerGame` caps a player's total stake per game (null = no limit).

## 5. Data model (Prisma)

```
User
  id, username (unique, 3–20 chars, [A-Za-z0-9_], case-insensitive unique),
  passwordHash, role (PLAYER | ADMIN), status (ACTIVE | SUSPENDED),
  suspendedUntil?, stakeLimitPerGame?, balance (int, default 0),
  referralCode (unique), referredById? -> User, createdAt

Game
  id, externalId (unique), startsAt, awayTeam, homeTeam (abbreviations),
  awayScore?, homeScore?,
  status (SCHEDULED | LIVE | FINAL | SETTLED | VOID | POSTPONED),
  pool (int, default 0), houseTake (int, default 0), settledAt?, voidReason?

Bet
  id, userId, gameId, awayDigit (0–9), homeDigit (0–9), stake (int),
  payout (int, default 0), result (PENDING | WON | LOST | REFUNDED), createdAt
  unique(userId, gameId, awayDigit, homeDigit)

Transaction
  id, userId, type (REFERRAL_BONUS | ADMIN_GRANT | ADMIN_DEDUCT | BET | PAYOUT | REFUND),
  amount (signed int), balanceAfter (int), gameId?, betId?, adminId?, note?, createdAt

Inquiry
  id, userId, subject, status (OPEN | ANSWERED | CLOSED), createdAt, updatedAt

InquiryMessage
  id, inquiryId, authorId -> User, body, createdAt

AdminAction
  id, adminId, action (string, e.g. SUSPEND, UNSUSPEND, SET_STAKE_LIMIT,
  RESET_PASSWORD, VOID_GAME, UPDATE_SETTING, GRANT_POINTS, DEDUCT_POINTS),
  targetUserId?, targetGameId?, details (JSON), createdAt

Setting
  key (PK), value (string)   -- currently: referralBonus
```

The 90/10 split is a code constant, not a setting.

## 6. Ledger invariants

1. `User.balance` changes **only** inside a DB transaction that also inserts a `Transaction` row with the matching `amount` and resulting `balanceAfter`.
2. For every user: `balance == sum(Transaction.amount)`.
3. **Bet placement** uses a conditional update: `UPDATE "User" SET balance = balance - :stake WHERE id = :id AND balance >= :stake`. Zero rows updated → insufficient balance. Game status/deadline and stake-limit checks run in the same transaction (game row locked `FOR UPDATE`).
4. **Settlement is idempotent:** it begins by `UPDATE "Game" SET status = 'SETTLED' WHERE id = :id AND status = 'FINAL'`; if zero rows updated, it exits. Payouts are written in the same transaction.
5. **Void** is likewise guarded by a conditional status update.

## 7. Screens

### Player
| Screen | Contents |
|---|---|
| Sign up / Log in | username, password, optional referral code (prefilled from `?ref=CODE`) |
| Games | today + upcoming games: AWAY @ HOME, tip-off time, status, pool, betting countdown; scores for live/final |
| Game detail | 10×10 ending grid (away digit × home digit); select cell, enter stake, confirm; list of own bets on the game; after settlement shows final ending and winners count |
| My Bets | bets filtered by result, with payouts |
| Wallet | balance + own transaction history |
| Referral | own code, share link, list of referred usernames |
| Inquiries | list of own tickets, create ticket (subject + message), thread view, reply |

### Admin
| Screen | Contents |
|---|---|
| Dashboard | player count, open pools, total house take, open inquiries, negative-balance players, last successful sync time (warn if > 30 min) |
| Players | search by username; detail page: balance, referrer, referred players, bets, transactions; actions: grant/deduct points (note required), suspend/unsuspend (optional end date), set/clear stake limit, reset password |
| Games | list by date/status with pool, house take, winners; flagged postponed games; actions: force sync, void (reason required) |
| Transactions | ledger filtered by username, type, date range |
| Inquiries | queue by status; thread view; reply (sets ANSWERED); close |
| Settings | referral bonus amount; admin action log |

Inquiry status: player creates → `OPEN`; admin reply → `ANSWERED`; player reply → `OPEN`; either side can close → `CLOSED` (closed tickets accept no replies).

## 8. Error handling

- Bet rejection messages: "Betting closed", "Insufficient balance", "Stake limit exceeded (remaining: N)", "Account suspended".
- Sync failures are logged and retried on the next run; dashboard shows last successful sync.
- Unknown API status values are logged and leave the game unchanged.
- Admin actions requiring a note/reason reject empty input.

## 9. Testing

- **Unit (Vitest):** ending calculation; payout split (pro-rata, flooring, remainder to house); no-winner case; void/reversal math.
- **Integration (Vitest + test Postgres):** bet placement (balance, deadline, stake limit, merging into existing bet, concurrent bets cannot overdraw); settlement idempotency (double run pays once); void before and after settlement; referral bonus on signup; admin grant/deduct; ledger invariant `balance == sum(amount)` asserted after each scenario.
- **Sync:** balldontlie client mocked; status mapping and upsert behavior.
- **E2E (Playwright):** signup with referral → admin grants points → player bets → game set FINAL via sync mock → payout visible in wallet.

## 10. Setup

- Env: `DATABASE_URL`, `AUTH_SECRET`, `BALLDONTLIE_API_KEY`, `CRON_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- Seed script creates the first admin and default settings.

## 11. Out of scope

Real money, payments, withdrawals; email/SMS; password self-reset; leaderboards; daily bonuses; push notifications; mobile apps; multiple sports.
