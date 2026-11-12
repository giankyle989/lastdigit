# LastDigit

Free-to-play NBA game: bet points on the last digit of each team's final score (LAL 99 @ GSW 106 → **9-6**). Winners split 90% of the pool by stake and never get back less than they staked; a pool with only one player, or with nobody on a losing ending, is refunded. Points have no cash value.

Points come from a signup bonus, a daily bonus claimed in the wallet, a referral bonus (paid when the referred friend's first bet settles) and admin grants. All three bonus amounts are set on Admin → Settings. Signups are limited to `SIGNUP_LIMIT_PER_HOUR` (default 5) per IP.

## Setup

```bash
npm install
cp .env.example .env          # then fill POSTGRES_PASSWORD (match DATABASE_URL), AUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD, BALLDONTLIE_API_KEY
npm run db:up                 # Postgres 16 on localhost:5433 (reads POSTGRES_PASSWORD from .env)
npx prisma migrate dev
npm run db:seed               # creates the admin from ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev
```

Re-running the seed resets the admin's password to `ADMIN_PASSWORD`. The seed refuses to run if `ADMIN_USERNAME` belongs to an existing player.

Get a free balldontlie API key at https://www.balldontlie.io.

## Game sync

The app syncs games itself. When the server starts, it pulls games (yesterday → +7 days) and settles finished ones, then repeats every `SYNC_INTERVAL_MINUTES` (default 5 in `.env.example`; unset or `0` turns it off). This needs `BALLDONTLIE_API_KEY` and a long-running server (`npm start` / `npm run dev`). Each server instance runs its own schedule, which is safe: sync never overwrites finished games and settlement is idempotent.

On serverless hosts (no long-running process), turn the schedule off and call the route instead: `GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET`. Admins can also click **Force sync** on Admin → Games.

## Production

1. Set environment variables: `AUTH_SECRET` (generate with `openssl rand -base64 32`), `CRON_SECRET`, `BALLDONTLIE_API_KEY`, `SYNC_INTERVAL_MINUTES`, plus `DATABASE_URL`, `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
2. Apply migrations with `npx prisma migrate deploy` (not `migrate dev`), then `npm run db:seed`.
3. `npm run build && npm start`.

## Tests

```bash
npm test          # unit + integration (uses lastdigit_test DB)
npm run test:e2e  # Playwright full flow on a desktop and an iPhone 13 viewport (Chromium)
```

Before pushing, run `npm run check` (format, lint, typecheck, tests). See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/engineering/standards.md](docs/engineering/standards.md).

## UI

- Player app: `/games` (date strip, `?date=YYYY-MM-DD`), `/games/[id]` (pickers, pool heatmap, estimate), bet slip (saved in `localStorage`), `/bets`, `/wallet`, `/more` (referral, support, account).
- Admin console: `/admin` (overview), `/admin/players`, `/admin/games`, `/admin/ledger`, `/admin/support`, `/admin/settings`. Tables are driven by `?q=&sort=&page=`; drawers open with `?player=`, `?game=` or `?ticket=` and can be linked to.
- Components: shadcn/ui lives in `src/components/ui` (add more with `npx shadcn@4.23.0 add <name>`, then run `npx eslint --fix` and `npx prettier --write` on the new file). The theme tokens are in `src/app/globals.css`.
