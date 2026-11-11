# LastDigit Redesign — Design Spec

**Date:** 2026-11-11
**Status:** Approved design, pending spec review
**Builds on:** `docs/superpowers/specs/2026-11-11-lastdigit-design.md` (game rules, ledger, data model unchanged)

## 1. Goal

Make LastDigit feel like a real sportsbook, work well on phones, and give admins a proper console. This is a full rethink of layout and flows. Game rules, points and the ledger are unchanged.

Success means:
- A player on a phone can find tonight's games, pick an ending with large buttons, and place several bets through one bet slip.
- A player sees where the pool is staked and an estimated payout before betting.
- An admin lands on an overview showing what needs attention. Players, games, the ledger and tickets are searchable tables with drawers that can be linked to.

Out of scope: new game rules, real money, notifications, NBA logos, light theme, new admin permissions.

## 2. Decisions

| Topic | Decision |
|---|---|
| Visual direction | Neon Sportsbook (dark, electric-green accent, team-colored badges) |
| Player structure | Games feed with date strip + bet slip (all-or-nothing confirm) |
| Picking an ending | Two digit pickers + pool heatmap toggle + estimated payout |
| Admin | Overview console home + searchable tables with slide-over drawers |
| Component approach | shadcn/ui (Radix + Tailwind, copied into the repo) + Recharts |

## 3. Design system

### 3.1 Tokens (Tailwind v4 `@theme` + shadcn CSS variables; dark only)
| Token | Value | Use |
|---|---|---|
| background | `#0b0f14` | page |
| surface | `#121821` | cards, panels |
| surface-2 | `#151c24` | chips, inputs |
| border | `#1f2a36` | card/table borders |
| foreground | `#e6edf3` | text |
| muted | `#8b9bb0` | secondary text |
| accent | `#39ff88` | primary buttons, OPEN, wins, focus ring |
| accent-foreground | `#0b0f14` | text on accent |
| live | `#f5a524` | LIVE, warnings, postponed |
| danger | `#ef4444` | losses, errors, negative balances, destructive |
| info | `#3b82f6` | secondary chart series |

Radius: 10px on controls, 14px on cards. Cards have a 1px border and no shadow.

### 3.2 Typography
- Inter for UI text, JetBrains Mono for numbers. Both load via `next/font/google`.
- Monospace with tabular figures applies to scores, endings (`9-6`), point amounts and countdowns.

### 3.3 Team colors
- `src/lib/teams.ts` maps all 30 NBA abbreviations to a primary hex color, with a fallback of `#334155`.
- Teams appear as a colored circle with the abbreviation. No logos.

### 3.4 Components
- **shadcn/ui, restyled:** Button, Card, Badge, Tabs, Sheet, Dialog, AlertDialog, Table, Input, Label, Select, Sonner (toasts), Skeleton, Tooltip, DropdownMenu.
- **Project components:** `TeamBadge`, `GameCard`, `StatusPill` (SCHEDULED shows as OPEN or CLOSED depending on the deadline; LIVE; FINAL; SETTLED; VOID; POSTPONED), `PointsAmount`, `Countdown` (calls `router.refresh()` when it reaches 0), `DigitPicker`, `EndingHeatmap`, `BetSlip`, `DataTable` (server-driven), `UrlSheet` (a drawer bound to a URL search param).

### 3.5 Shells
- **Player, phone (< 768px):**
  - A top bar with the logo and a balance pill, the content, and a fixed bottom tab bar: Games · Bets · Wallet · More.
  - When the slip has picks, a bet-slip bar floats above the tab bar and opens as a bottom Sheet.
- **Player, desktop (≥ 768px):** a top bar with the tabs inline, the content in a centered column, and the bet slip as a sticky right column (320px).
- **Admin:**
  - A left sidebar: Overview, Players, Games, Ledger, Support, Settings. Support shows a count of OPEN tickets, and Overview shows a dot when something needs attention.
  - The header shows the admin's username and a "Player site" link. On a phone, the sidebar becomes a slide-out menu.
- **Auth:** a centered card on the background, with a one-line explainer ("Pick the last digit of each team's final score").

### 3.6 Feedback
- Action results show as toasts. Field-level validation errors stay inline under the field.
- Each route segment has a `loading.tsx` (skeletons) and an `error.tsx` (message + Retry).

## 4. Player flows

### 4.1 Games feed `/games`
- **Date strip:**
  - Yesterday, Today, and the next 6 days, in US Eastern dates.
  - The selected day comes from `?date=YYYY-MM-DD`; Today is the default. An invalid or out-of-range date falls back to Today.
- **Sections for the day, in order:**
  - **Live**: status LIVE.
  - **Open for bets**: SCHEDULED, before tip-off.
  - **Upcoming / closed**: SCHEDULED past tip-off, or POSTPONED.
  - **Final**: FINAL, SETTLED or VOID.
  - Empty sections are hidden. If the whole day is empty, the page shows "No games on this day".
- **Game card:**
  - Team badges, `AWAY @ HOME`, and tip-off time in ET (or the score when live or final).
  - Pool, StatusPill, and a Countdown while open.
  - A chip like "N picks" when the viewer has bets on the game.
  - The whole card links to the game.

### 4.2 Game screen `/games/[id]`
- **Header:** team badges, StatusPill, tip-off, pool, and the score when LIVE/FINAL/SETTLED. The winning ending appears once FINAL or SETTLED; VOID shows its reason.
- **Mode toggle:** **Pickers** (default) or **Heatmap**.
  - **Pickers:** two labelled rows of buttons 0–9, one for the away team's last digit and one for the home team's, each with an aria-label like "LAL digit 9".
  - **Heatmap:** a 10×10 grid (rows = away digit, columns = home digit) shaded by the stake on each ending (5 steps from surface to accent). Tapping a cell selects that ending and syncs the pickers. Each cell has an aria-label like "Ending 9-6, 1,200 staked".
- **Selected ending panel:**
  - The ending (`9-6`), the points staked on it, and the **estimated payout per 100 points staked** (§6.3).
  - It's labelled "Estimate — changes as others bet".
- **Add to slip:**
  - A button that adds `{gameId, awayDigit, homeDigit}` at the last-used stake (default 100).
  - It's disabled until both digits are chosen.
  - When betting is closed, the pickers and the button are disabled and the heatmap stays readable.
- **My bets on this game:** each with ending, stake, result and payout.

### 4.3 Bet slip
- **Storage:** client state in `localStorage` under the key `lastdigit.slip.<userId>`, which survives reloads. A missing key or one that can't be parsed means an empty slip.
- **Picks:**
  - A pick is `{ gameId, awayDigit, homeDigit, stake }`.
  - Adding the same game and ending again adds its stake to the existing pick.
  - The slip holds at most 20 picks; adding more shows a toast.
- **Each pick row:**
  - Matchup, ending, stake input (whole numbers ≥ 1), quick chips **+10 / +50 / +100 / Max**, and remove.
  - Max = balance minus the other picks' stakes, never below 0.
- **Footer:** total stake, current balance, and the estimated total return if every pick hits (the sum of each pick's estimate at its stake). **Confirm bets** is disabled if the total is more than the balance or any pick is closed.
- **Freshness:**
  - When the slip opens and before confirming, it calls `getSlipStatus(picks)`, which returns, for each game, whether it is open, the pool, and the stake on the chosen ending.
  - Closed picks are greyed out and marked "Betting closed". They must be removed before confirming.
- **Confirm:**
  - Calls `placeBetsAction(picks)`.
  - **Success:** the slip clears, a toast says "N bets placed", and the page data refreshes.
  - **Failure:** the slip is kept, the failing pick is highlighted, and the error shows in a toast.

### 4.4 My Bets `/bets`
- Tabs: **Open** (PENDING), **Settled** (WON and LOST), **Refunded**.
- Bets are grouped by game (a game card header, then rows: ending · stake · result · payout).
- Wins are accent-colored with "+payout"; losses are muted.
- Each tab is paginated, 20 games per page.

### 4.5 Wallet `/wallet`
- A balance hero card.
- Filter chips:
  - **All**;
  - **Bets** = BET;
  - **Payouts** = PAYOUT;
  - **Bonuses** = REFERRAL_BONUS;
  - **Admin** = ADMIN_GRANT and ADMIN_DEDUCT;
  - **Refunds** = REFUND.
- Transactions are grouped by ET day. Each row shows an icon per type, a description, a signed amount (accent for positive, danger for negative) and the balance after.
- Paginated, 50 per page.

### 4.6 More `/more`
- **Referral `/more/referral`:**
  - Your code, a **Copy** button, and a **Share** button (`navigator.share` when available, otherwise copy). The share link is `<origin>/signup?ref=CODE`.
  - The current bonus amount, and the list of players you referred.
- **Support `/more/support`, `/more/support/[id]`:** a ticket list with status, a "New ticket" form, and each thread as chat bubbles (yours on the right, Support's on the left), with Reply and Close while not CLOSED.
- **Account:** your username and Log out.
- **Redirects:** `/referral` → `/more/referral` and `/inquiries[/:id]` → `/more/support[/:id]`, both permanent, in `next.config.ts`.

### 4.7 Auth pages
- Restyled login and signup. Fields, labels and behavior are unchanged.
- A logged-in user who visits `/login` or `/signup` is redirected to `/`.

## 5. Admin console

### 5.1 Overview `/admin`
- **KPI tiles:**
  - Players (with "+N in 7d");
  - Open pools (total, and the number of games);
  - House take (last 7 ET days, with all-time in a tooltip);
  - Sync (last successful sync as relative time; danger when stale over 30 min).
- **Chart (Recharts, client component):** the last 14 ET days, two series.
  - **Volume:** the sum of |amount| of BET transactions created that day.
  - **House take:** the sum of `houseTake` of games settled that day.
- **Needs attention:** postponed games (open the game drawer), negative balances (open the player drawer), open tickets (open the ticket drawer). Shows "All clear" when empty.
- **Top bettors today:** the top 5 players by BET volume in today's ET day, each opening the player drawer.

### 5.2 Table pattern (`DataTable`)
- **Server-driven:** search params `q`, `sort` (`field` or `-field`), `page` (1-based), plus each page's filters. 25 rows per page.
- **Sorting:** only fields on each page's whitelist are allowed; an unknown sort falls back to the default. A bad `page` falls back to 1.
- **Drawers:**
  - Clicking a row sets `?player=` / `?game=` / `?ticket=`, which opens a `UrlSheet` from the right (full screen on a phone).
  - Closing it removes the param. Esc and the back button close it.
  - An unknown id shows "Not found" in the drawer.

### 5.3 Players `/admin/players`
- **Columns:** username, balance (danger if < 0), status, stake limit, number of referrals, joined.
- **Search** by username; **filter** by status (All / Active / Suspended); default sort `-joined`.
- **Drawer:**
  - A header with username, balance, status, who referred them, and when they joined.
  - Actions:
    - **Grant** and **Deduct** (Dialog: amount + note);
    - **Suspend** (Dialog: optional end date, with an AlertDialog to confirm) or **Unsuspend**;
    - **Stake limit** (Dialog);
    - **Reset password** (Dialog).
  - Tabs: **Bets** (latest 50), **Ledger** (latest 50), **Referrals**.

### 5.4 Games `/admin/games`
- **Columns:** matchup, tip-off, status, score, pool, house take, winners.
- **Filters:** status, date range (`from`/`to`, ET dates). Default sort `-tipoff`. POSTPONED rows are highlighted. **Force sync** button sits in the page header.
- **Drawer:** the game summary, the `EndingHeatmap` showing the pool breakdown (read-only), the winning bets list, and **Void** (Dialog with a required reason, then an AlertDialog to confirm) unless the game is already VOID.

### 5.5 Ledger `/admin/ledger`
- **Columns:** time, player, type, amount, balance after, note.
- **Filters:** username, type, date range.
- **Totals row:** the sum of amounts for the current filter.
- Clicking a player name opens the player drawer (it moves to `/admin/players?player=<id>`).
- **Redirect:** `/admin/transactions` → `/admin/ledger` (permanent).

### 5.6 Support `/admin/support`
- Tabs: OPEN / ANSWERED / CLOSED (default OPEN), with search by subject or username.
- **Drawer:** the chat-bubble thread, Reply (sets ANSWERED) and Close.
- **Redirect:** `/admin/inquiries[/:id]` → `/admin/support[?ticket=:id]` (permanent).

### 5.7 Settings `/admin/settings`
The referral bonus form, and the admin action log as a paginated table filtered by action type.

### 5.8 Guards
Every admin page and server action calls `requireAdmin()` first, and every player page and action calls `requireUser()` first, as today.

## 6. Backend additions

### 6.1 `placeBets(userId, picks, now)` — `src/server/bets.ts`
- **Input:** 1–20 picks of `{ gameId, awayDigit, homeDigit, stake }`, validated by zod with the same rules as `placeBet`.
- **One `prisma.$transaction`:**
  1. Load the user; reject if suspended.
  2. Lock the distinct games `FOR UPDATE` in ascending id order.
  3. For each pick: the game must be SCHEDULED and `now < startsAt`.
  4. Stake limit, per game: existing stake plus the sum of this slip's stakes for that game must be within the limit.
  5. Upsert each bet (merge, as today), `postEntry(BET, -stake, requireFunds)`, and increment the pool.
- **On any failure:** throw a `DomainError` whose message is prefixed with the pick label, e.g. `LAL @ GSW 9-6: Betting closed`, and include `pickIndex` on the error. The whole transaction rolls back.
- **Existing call:** `placeBet(userId, input, now)` becomes `placeBets(userId, [input], now)` and returns the single bet. Its existing error messages (no prefix for a single pick) and tests stay valid.

### 6.2 `getEndingStakes(gameId)` — `src/server/queries/stakes.ts`
- Returns `{ pool: number, cells: number[10][10] }`, built from `bet.groupBy({ by: [awayDigit, homeDigit], _sum: { stake } })`, excluding REFUNDED bets.
- Only totals are returned, never usernames.

### 6.3 `estimatePayout(pool, endingStake, stake)` — `src/lib/game/payout.ts`
- `floor(floor((pool + stake) × 90 / 100) × stake / (endingStake + stake))`.
- Must equal `computeSplit`'s payout for a bet of `stake` added to a pool of `pool` with `endingStake` already on that ending, assuming no further bets.

### 6.4 Other queries
- **Player:**
  - `listGamesForDate(etDate, userId)`, which returns games plus `myPickCount`;
  - `listMyBetsGrouped(userId, tab, page)`;
  - `listMyTransactions(userId, filter, page)`;
  - `getSlipStatus(userId, picks)`.
- **Admin:**
  - `getOverviewStats(now)`, `getDailyVolume(days, now)`, `getTopBettorsToday(now)`;
  - paginated `listPlayers`, `listGames`, `listLedger`, `listTickets`, `listAdminActions`, each taking `{ q, sort, page, ...filters }` with sort whitelists.
- **ET date helpers** in `src/lib/dates.ts`: `etDateOf(date)`, `etDayRange(etDate)` (UTC start and end), `etDateStrip(now)`.

### 6.5 Migration
Add `@@index([type, createdAt])` on `Transaction`. No other schema changes.

## 7. Errors and edge cases
- **Slip with closed or postponed games:** flagged by `getSlipStatus`; confirming is blocked until they're removed. If one closes between the check and confirming, the server rejects it and the slip shows which pick.
- **Balance changes while the slip is open:** the server is authoritative, so an insufficient-balance error highlights the pick that failed.
- **localStorage unavailable** (private mode): the slip works in memory for the session.
- **Estimate:** always labelled as an estimate, and recalculated from fresh data after any bet and on reload.
- **Malformed params** (`date`, `page`, `sort`, drawer ids): fall back to defaults or a "Not found" drawer; never a 500.
- **Accessibility:**
  - Every interactive control has an accessible name, and focus rings use the accent color.
  - Drawers and dialogs trap focus (Radix).
  - Text contrast is at least 4.5:1 against the background.

## 8. Testing
- **Unit:**
  - `estimatePayout` against `computeSplit` (table of cases);
  - the bet-slip reducer (add, merge, remove, set stake, max, cap 20);
  - ET date helpers (DST boundary, midnight ET);
  - sort-whitelist parsing.
- **Integration (Postgres):**
  - `placeBets`:
    - all succeed;
    - one closed pick rolls everything back (balances and pools unchanged);
    - insufficient balance across picks;
    - stake limit counting slip picks;
    - concurrent overlapping slips: no deadlock, no overspend, ledger consistent.
  - `getEndingStakes` (excludes REFUNDED);
  - `getDailyVolume` / `getTopBettorsToday` (ET day bucketing);
  - the paginated admin lists (search, filter, sort, page).
- **Page guards:** the existing guard test is extended to every new or moved page.
- **E2E (Playwright), desktop and an iPhone 13 viewport:** signup with referral → admin grants via the player drawer → player picks 9-6 with the pickers → adds to slip → confirms → sync settles the game → wallet shows 990 pts and a Payout row.
