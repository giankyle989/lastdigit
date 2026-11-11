# Contributing to LastDigit

## Setup

```bash
nvm use                      # Node 24 (.nvmrc)
npm install                  # also installs git hooks (husky)
cp .env.example .env         # fill POSTGRES_PASSWORD (match DATABASE_URL), AUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD, BALLDONTLIE_API_KEY
docker compose up -d
npx prisma migrate dev
npm run db:seed
npm run dev
```

## Branches and commits

- Branch from `master`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org): `feat: add bet slip`, `fix(sync): …`. Allowed types: feat, fix, chore, docs, test, refactor, style, perf, ci, build, revert.
- No AI attribution in commits or PR descriptions: no `Co-Authored-By` naming Claude or Anthropic, no "Generated with Claude Code", no `noreply@anthropic.com`. commitlint rejects these, and the Claude Code guard hook blocks them too.
- Never skip hooks: no `--no-verify`, `git commit -n` or `HUSKY=0`. If a hook fails, fix the reported problem.

## Workflow

1. Features: write a spec in `docs/superpowers/specs/`, then a plan in `docs/superpowers/plans/`, then implement task by task with tests first.
2. Run `npm run check` (and `npm run test:e2e` for UI changes) before pushing.
3. Open a PR using the template; the title must be a Conventional Commit (it becomes the squash commit message).
4. CI (`quality`, `test`, `e2e`, PR title) must be green. `master` is protected: PRs only, no force pushes.

## Standards

Read `docs/engineering/standards.md`. The essentials are in `CLAUDE.md`.
