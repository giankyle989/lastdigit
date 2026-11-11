# LastDigit

Free-to-play NBA game: bet points on the last digit of each team's final score (LAL 99 @ GSW 106 → **9-6**). Winners split 90% of the pool by stake. Points have no cash value.

## Setup

```bash
npm install
npm run db:up                 # Postgres 16 on localhost:5433
cp .env.example .env          # then fill AUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD, BALLDONTLIE_API_KEY
npx prisma migrate dev
npm run db:seed               # creates the admin from ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev
```

Get a free balldontlie API key at https://www.balldontlie.io.

## Game sync

`GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET` pulls games (yesterday → +7 days) and settles finished games. Call it every 5 minutes, for example with crontab:

```
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/sync > /dev/null
```

(Vercel Hobby cron runs at most daily; use an external cron service or a VPS crontab.) Admins can also click **Force sync** on Admin → Games.

## Tests

```bash
npm test          # unit + integration (uses lastdigit_test DB)
npm run test:e2e  # Playwright full flow
```
