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
