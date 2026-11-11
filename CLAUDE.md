# LastDigit — agent guide

Free-to-play NBA game: players bet points on the last digit of each team's final score. Next.js 15 (App Router) + Prisma 6 + Postgres + Auth.js. Full standards: `docs/engineering/standards.md`. Contributor flow: `CONTRIBUTING.md`.

## Commands

```bash
docker compose up -d        # Postgres on :5433 (needs POSTGRES_PASSWORD in .env)
npm run dev                 # dev server
npm run check               # format:check + lint + typecheck + unit/integration tests — run before pushing
npm run test:e2e            # Playwright (port 3100)
npx prisma migrate dev --name <name>   # schema change (never migrate reset)
```

## Architecture (enforced by ESLint + tests/architecture.test.ts)

| Folder            | Role                                                                                            | Must not import                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/`        | pure helpers: game math, validation, formatting, dates                                          | `@/lib/db` (except db.ts), `@/server/*`, `next/*`, `react`, UI                              |
| `src/server/`     | domain services + queries — the only home of business rules                                     | `next/*`, `react`, `@/app/*`, `@/components/*` (session.ts may use next/navigation, @/auth) |
| `src/app/`        | pages, layouts, server actions — thin: guard → validate → call src/server → revalidate/redirect | `@/lib/db`                                                                                  |
| `src/components/` | UI                                                                                              | `@/lib/db`, `@/server/*`                                                                    |

## Hard rules

1. `User.balance` changes only through `postEntry()` (`src/server/ledger.ts`).
2. Every page and every exported server action calls `requireUser()` / `requireAdmin()` itself (exceptions: login/signup/logout actions). Never rely on a layout guard.
3. Validate all external input (forms, search/route params, API data) with zod in `src/server` or at the action boundary.
4. Money-like state changes run in a transaction with a row lock or a conditional update; lock multiple rows in ascending id order.
5. Never run `prisma migrate reset`. Schema changes = committed migration.
6. Conventional Commits (`feat|fix|chore|docs|test|refactor|style|perf|ci|build|revert`). **Never add AI attribution to commits or PRs:** no `Co-Authored-By:` naming Claude/Anthropic, no "Generated with Claude Code", no `noreply@anthropic.com`.
7. Branch → PR → `npm run check` and `npm run test:e2e` pass locally → squash merge (there is no CI). Never commit `.env`, secrets, `.superpowers/`, test artifacts. Never use `--no-verify`, `git commit -n` or `HUSKY=0`, and never change `core.hooksPath` to skip hooks.

## Workflow

- Features: spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → tasks with review → whole-branch review → PR.
- Small fixes: branch → failing test → fix → PR.
- Tests: TDD; server logic tested against real Postgres (`tests/integration`), no DB mocks.
- Hooks: an edited file is auto-formatted and linted; remaining lint errors are fed back — fix them before moving on. Shell commands that reset the database, skip git hooks, force-push to master or add AI attribution to a commit are blocked; fix the underlying problem instead.
