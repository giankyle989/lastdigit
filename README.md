# LastDigit

Free-to-play NBA game: bet points on the last digit of each team's final score (LAL 99 @ GSW 106 → **9-6**). Winners split 90% of the pool by stake. Points have no cash value.

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

`GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET` pulls games (yesterday → +7 days) and settles finished games. Call it every 5 minutes, for example with crontab:

```
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/sync > /dev/null
```

(Vercel Hobby cron runs at most daily; use an external cron service or a VPS crontab.) Admins can also click **Force sync** on Admin → Games.

## Production

1. Set environment variables: `AUTH_SECRET` (generate with `openssl rand -base64 32`), `CRON_SECRET`, `BALLDONTLIE_API_KEY`, plus `DATABASE_URL`, `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
2. Apply migrations with `npx prisma migrate deploy` (not `migrate dev`), then `npm run db:seed`.
3. `npm run build && npm start`.
4. Schedule the cron (see Game sync above).

## Tests

```bash
npm test          # unit + integration (uses lastdigit_test DB)
npm run test:e2e  # Playwright full flow
```

Before pushing, run `npm run check` (format, lint, typecheck, tests). See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/engineering/standards.md](docs/engineering/standards.md).
