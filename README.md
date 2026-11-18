# LastDigit

Free-to-play NBA game: bet points on the last digit of each team's final score (LAL 99 @ GSW 106 → **9-6**). Winners split 90% of the pool by stake and never get back less than they staked; a pool with only one player, or with nobody on a losing ending, is refunded. Points have no cash value.

Points come from admin top-ups (grants), a welcome bonus matching a player's first top-up 1:1 (up to 1,000), a referral bonus (50% of the referred friend's first top-up, up to 200) and an optional daily bonus claimed in the wallet (off by default). All bonus amounts are set on Admin → Settings. Signups are limited to `SIGNUP_LIMIT_PER_HOUR` (default 5) per IP.

## Setup

```bash
npm install
cp .env.example .env          # then fill POSTGRES_PASSWORD (match DATABASE_URL), AUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD, BALLDONTLIE_API_KEY
npm run db:up                 # Postgres 16 on localhost:5433 (reads POSTGRES_PASSWORD from .env)
npx prisma migrate dev
npm run db:seed               # creates the superadmin from ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev
```

Re-running the seed resets the superadmin's password to `ADMIN_PASSWORD`. The seed refuses to run if `ADMIN_USERNAME` belongs to any existing account that is not already the superadmin.

Get a free balldontlie API key at https://www.balldontlie.io.

## Game sync

The app syncs games itself. When the server starts, it pulls games (yesterday → +7 days) and settles finished ones, then repeats every `SYNC_INTERVAL_MINUTES` (default 5 in `.env.example`; unset or `0` turns it off). This needs `BALLDONTLIE_API_KEY` and a long-running server (`npm start` / `npm run dev`). Each server instance runs its own schedule, which is safe: sync never overwrites finished games and settlement is idempotent.

On serverless hosts (no long-running process), turn the schedule off and call the route instead: `GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET`. Superadmins can also click **Force sync** on Admin → Games.

## Production

1. Set environment variables: `AUTH_SECRET` (generate with `openssl rand -base64 32`), `CRON_SECRET`, `BALLDONTLIE_API_KEY`, `SYNC_INTERVAL_MINUTES`, plus `DATABASE_URL`, `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
2. Apply migrations with `npx prisma migrate deploy` (not `migrate dev`), then `npm run db:seed`.
3. `npm run build && npm start`. `npm start` runs `node server.mjs`, a small custom server that stamps the real client IP on each request (used for rate limits and account flags).

Server settings (in `.env` or the environment): `HOST` (default `0.0.0.0`), `PORT` (default `3000`) and `TRUSTED_PROXY`. Set `TRUSTED_PROXY=1` only behind a reverse proxy that appends the client to `X-Forwarded-For`; otherwise leave it unset, or clients could spoof their IP.

**Upgrading to admin levels.** Take a `pg_dump` first, then do these together: `npm run build` → `npx prisma migrate deploy` → `systemctl --user restart lastdigit`. The migration renames the `ADMIN` role to `SUPERADMIN`, so the old running build cannot read it and the admin cannot log in until the restart. `npm run db:seed` afterwards is optional (it upserts the SUPERADMIN). To roll back to the old build, first delete or demote any MANAGER accounts, then run `ALTER TYPE "Role" RENAME VALUE 'SUPERADMIN' TO 'ADMIN';` (the extra MANAGER enum value is harmless).

**Upgrading to wallet and points.** The migration renames `User.balance` to `walletBalance` (today's balances become wallet money) and adds `pointsBalance`, `Transaction.account` and `Bet.pointsStake`.

1. Back up: `pg_dump` the database.
2. `npm run build`
3. `npx prisma migrate deploy`
4. `systemctl --user restart lastdigit`

Run steps 2-4 together: after the migration the old running build can't read `balance`.

**Rollback** (before anyone has points):

```sql
ALTER TABLE "User" DROP COLUMN "pointsBalance";
ALTER TABLE "User" RENAME COLUMN "walletBalance" TO "balance";
ALTER TABLE "Transaction" DROP COLUMN "account";
ALTER TABLE "Bet" DROP COLUMN "pointsStake";
DROP TYPE "Account";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118000003_wallet_and_points';
```

Then deploy the previous build. Once points have been used, first add each player's `pointsBalance` into `walletBalance`.

Rotating `AUTH_SECRET` also changes the device and network fingerprints, so old sightings stop matching new ones.

## Tests

```bash
npm test          # unit + integration (uses lastdigit_test DB)
npm run test:e2e  # Playwright full flow on a desktop and an iPhone 13 viewport (Chromium)
```

Before pushing, run `npm run check` (format, lint, typecheck, tests). See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/engineering/standards.md](docs/engineering/standards.md).

## UI

- Player app: `/games` (date strip, `?date=YYYY-MM-DD`), `/games/[id]` (pickers, pool heatmap, estimate), bet slip (saved in `localStorage`), `/bets`, `/wallet`, `/more` (referral, support, account).
- Admin console: `/admin` (overview), `/admin/players`, `/admin/games`, `/admin/ledger`, `/admin/support`, `/admin/settings` (superadmin only), `/admin/staff` (superadmin only: add, disable, enable, reset managers). Managers can use the overview, players, ledger, games (view), support, top-ups/deductions/bonus points and player care; they cannot void or resync games or change settings or staff. Tables are driven by `?q=&sort=&page=`; drawers open with `?player=`, `?game=` or `?ticket=` and can be linked to.
- Components: shadcn/ui lives in `src/components/ui` (add more with `npx shadcn@4.23.0 add <name>`, then run `npx eslint --fix` and `npx prettier --write` on the new file). The theme tokens are in `src/app/globals.css`.
