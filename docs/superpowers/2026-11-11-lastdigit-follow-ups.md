# LastDigit MVP — follow-ups

Items found during task and final reviews that were deliberately left for later. None block a private/dev deployment.

## Before a public launch
- Rate limiting on login and sign-up; username-enumeration timing in `verifyCredentials` (compare against a dummy hash for unknown users).
- `APP_URL` env var for referral share links (currently built from `Host` / `X-Forwarded-Proto`).
- Unknown balldontlie statuses: map an explicit allow-list and skip anything else (spec §8 says unknown statuses leave the game unchanged; today they become LIVE/SCHEDULED).
- Cron route returns 200 even when `errors > 0`; consider a non-200 or alert for partial failures.
- Int32 limits: `User.balance` / `Game.pool` are Int; stakes and grants allow up to 1e9 — lower the caps or move to BigInt.
- Select only needed columns in `searchPlayers` / `getPlayerDetail` (they load `passwordHash`; not sent to the browser today).

## Product / UX
- Admin games page: add a date filter (spec §7 says "by date/status").
- Bet page: refresh when the countdown reaches 0; clear the stake after a successful bet.
- Logged-in users can still open `/login` and `/signup`.
- Admin lists are capped (100–300 rows) with no "more" indicator.

## Tests / maintenance
- Deterministic race tests (void vs sync, reply vs close, same-game stake-limit concurrency).
- Tests for `session.ts` guards beyond the page-guard test, admin list queries, player list queries, cron 200/500 paths.
- `package.json#prisma` seed config is deprecated in Prisma 7 (move to `prisma.config.ts` when upgrading).
- Guard test/e2e setup to refuse any `DATABASE_URL` whose DB name doesn't end in `_test`.

## Redesign — deferred review findings

Left for later during the redesign task and final reviews. None blocks merging.

### UX / product
- Game screen: ring the winning ending in the heatmap on FINAL/SETTLED games (the header already shows it); show the estimate at the slip's last stake, not per 100; hide the estimate note when betting is closed.
- Support tickets show raw status enums (`OPEN`, `ANSWERED`, `CLOSED`); add labels.
- Volume chart: thousands separators on the axis/tooltip; `<figure aria-label>` → `role="img"` or a figcaption.
- `newPlayers7d` is a rolling 168 h while `houseTake7d` is 7 ET days — same-looking labels, different windows.
- Closing a drawer uses `router.replace`, so Back right after closing appears to do nothing once.
- Admin search `contains` doesn't escape `%`/`_`.

### Code
- Bet slip: `add()` checks capacity against render-time state (double-click can toast success on a rejected pick); a stored slip with duplicate picks isn't rejected; the hidden desktop slip column still fetches status on phones; `writeStorage` warns on every change when storage is blocked.
- `placeBets` returns intermediate upsert rows for merged picks (summing returned stakes double-counts); `lockGames` sorts ids with JS order, not Postgres collation — note this before adding any SQL multi-game lock.
- `hrefWith` uses `key in patch` (prototype keys); use `Object.hasOwn`.
- `ActionForm`: `confirmedRef` stays set if `requestSubmit()` fires no submit event; a "kept mounted" helper for forms whose visibility depends on revalidated data would stop the lost-toast bug recurring (fixed in five places).
- Grant/Deduct dialogs duplicate each other; extract `AdjustPointsDialog`. Shows-score logic is duplicated in GameCard/GameHeader.
- Settings page awaits the bonus and the log one after the other (was `Promise.all`).
- `@@index([type])` on Transaction is redundant with `[type, createdAt]`; unused shadcn primitives (`badge`, `dropdown-menu`, `table`, `skeleton`).

### Tests
- `route-states.test.ts` only scans `page.tsx` for `<Suspense`; extend it to layouts and components.
- Gaps: `etDateOf` at DST-day boundaries; volume chart data on a DST day; top bettors at 04:59:59Z/05:00Z; stale-sync at exactly 30 min; `placeBets` with a suspended multi-pick slip, `MAX_STAKE` and a race with `voidGame`; non-winning bets in `getGameDetail`; throwing `localStorage`; picker/heatmap component behaviour; redirect routing (only the config is asserted).
