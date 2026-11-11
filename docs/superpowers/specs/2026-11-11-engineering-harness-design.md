# LastDigit Engineering Harness — Design Spec

**Date:** 2026-11-11
**Status:** Approved design, pending spec review
**Branch:** `chore/harness` (from `master` after PR #1 merged)

## 1. Goal

Before the redesign starts, give the LastDigit repo a harness, so that every change follows the same code standards, principles and workflow, whether a human or a Claude Code agent makes it. Violations must be caught automatically at edit time, at commit time, at push time and in CI, not only in review.

Success means:
- `npm run check` and CI are green on `master`.
- A commit message with a Claude co-author or "Generated with Claude" line is rejected by the git hook and blocked by the agent hook.
- An agent edit that breaks lint or formatting gets the error fed back immediately.
- `master` is protected: PRs only, and required checks must pass.
- All existing code meets the new rules: the whole repo is fixed now, with no exceptions carried forward.

Out of scope: the redesign itself, new product features, deployment pipelines, required review approvals, enforcing branch names with a hook.

## 2. Principles and agent rules

### 2.1 Documents
- **`CLAUDE.md` (repo root, at most ~150 lines):**
  - project summary and commands;
  - the architecture map (§2.2);
  - the hard rules (§2.3);
  - the workflow (§2.5);
  - links to `docs/engineering/standards.md` and `CONTRIBUTING.md`.
- **`docs/engineering/standards.md`:** the full reference for §2.2–§2.4. Each principle has a short good/bad example taken from this codebase.
- **`CONTRIBUTING.md`:** setup, branch and commit rules, the PR flow, and how to run checks.

### 2.2 Layers
| Folder | May import | Must not import |
|---|---|---|
| `src/lib/**` | other `src/lib`, `zod`, Prisma **types** only | `@/lib/db` (except `src/lib/db.ts` itself), `@/server/*`, `next/*`, `react`, `@/app/*`, `@/components/*` |
| `src/server/**` | `src/lib`, Prisma, other `src/server` | `next/*`, `react`, `@/app/*`, `@/components/*` — **except** `src/server/session.ts` (may import `next/navigation` and `@/auth`) |
| `src/app/**` | everything except below | `@/lib/db` |
| `src/components/**` | `src/lib`, `@/app/**/actions` | `@/lib/db`, `@/server/*` |

- `src/lib/db.ts` is the Prisma client module. Only `src/server/**`, `tests/**`, `e2e/**` and `prisma/**` may import it.
- Pages and server actions follow the same order: guard → validate/parse → call a `src/server` function → revalidate or redirect.

### 2.3 Hard rules
1. Every `User.balance` change goes through `postEntry()` in `src/server/ledger.ts`. No other code writes `balance`.
2. Every `page.tsx` under `src/app/admin/**` calls `requireAdmin()`, and every one under `src/app/(player)/**` calls `requireUser()`, in its own body. Every exported function in a `'use server'` file calls one of them first, except those on the auth allow-list (`loginAction`, `signupAction`, `logoutAction`).
3. All external input (form data, search params, route params, API responses) is validated with zod or explicit checks in `src/server` or at the action boundary.
4. Changes to money-like state run in a database transaction with a row lock or a conditional update. When multiple rows are locked, they are locked in a fixed order (ascending id).
5. Never run `prisma migrate reset`. Schema changes ship as committed migrations created with `prisma migrate dev --name <name>`.
6. Commit messages follow Conventional Commits and never contain `Co-Authored-By:` lines naming Claude or Anthropic, or "Generated with Claude Code".
7. Work happens on a branch and merges through a PR. Never commit `.env`, secrets, `.superpowers/` or test artifacts.

### 2.4 Code principles
- **TDD:** new behavior starts with a failing test, and a bug fix starts with a test that reproduces the bug. Server logic is tested against real Postgres; database code is not mocked.
- **Errors:** expected failures throw `DomainError` and are shown through `runAction`. Never swallow an error: log it and count it, or rethrow it.
- **Naming:** functions are verbs; read queries start with `get`, `list` or `search`. File names are kebab-case; React components are PascalCase.
- **Size:** one responsibility per file. Split a file when it grows past about 300 lines. YAGNI: no speculative options.
- **Types:**
  - No `any` and no non-null `!`.
  - `as` only at validated boundaries.
  - An exhaustive `switch` over union/enum types.
  - Type-only imports use `import type`.
- **UI:**
  - Every interactive control has an accessible name.
  - No raw `'` in JSX text.
  - Client components never touch the database.

### 2.5 Workflow
1. **Feature work:** spec (`docs/superpowers/specs`) → plan (`docs/superpowers/plans`) → tasks, each reviewed → whole-branch review → PR.
2. **Small fixes:** branch → test → fix → PR.
3. **Before pushing:** run `npm run check`.
4. **Merging:** only when CI is green. Squash merge with a Conventional-Commit PR title.

## 3. Enforcement tooling

### 3.1 Prettier
- Config `.prettierrc.json`:
  ```json
  { "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 110, "plugins": ["prettier-plugin-tailwindcss"] }
  ```
- `.prettierignore` lists `.next`, `node_modules`, `package-lock.json`, `prisma/migrations`, `test-results`, `playwright-report`, `.superpowers`, `docs/superpowers` (generated planning docs keep their own formatting) and `public`.
- The whole repo is formatted once, in a dedicated commit (`style: format repository with prettier`).

### 3.2 ESLint (flat config `eslint.config.mjs`)
- **Base:** `next/core-web-vitals`, `next/typescript`.
- **typescript-eslint with type info** (`parserOptions.projectService: true`), applied to `**/*.{ts,tsx}`, set to error:
  - `no-floating-promises`, `no-misused-promises` (with `checksVoidReturn.attributes: false` for React form actions), `await-thenable`;
  - `switch-exhaustiveness-check`;
  - `consistent-type-imports`;
  - `no-explicit-any`;
  - `no-non-null-assertion`.
- **Import order:** `eslint-plugin-simple-import-sort` (`imports` and `exports` set to error).
- **Layer boundaries:** `no-restricted-imports`, one override block per row of §2.2. Each message names the rule, e.g. "src/lib must stay pure: no database access".
- `eslint-config-prettier` comes last, so ESLint doesn't fight Prettier.
- Ignored: `.next`, `node_modules`, `next-env.d.ts`, `prisma/migrations`, `test-results`, `playwright-report`, `.superpowers`.

### 3.3 TypeScript
Add to `compilerOptions`: `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`. Existing violations are fixed without disabling the options.

### 3.4 Architecture tests (`tests/architecture.test.ts`, Vitest, static source scan)
1. **Balance writes:** no file under `src/` other than `src/server/ledger.ts` matches `/balance\s*:\s*\{\s*(increment|decrement|set)/`, `/balance\s*:\s*-?\d/` inside `data:`, or `/"balance"\s*=/` in SQL.
2. **Page guards:** every `src/app/admin/**/page.tsx` contains `await requireAdmin()`, and every `src/app/(player)/**/page.tsx` contains `await requireUser()`.
3. **Server actions:** in every file whose first statement is `'use server'`, each `export async function` body contains `requireUser(` or `requireAdmin(`, unless its name is on the allow-list (§2.3 rule 2).
4. **Database imports:** no file under `src/app` or `src/components` imports `@/lib/db`. This mirrors the lint rule, so it still fails if lint is bypassed.

Each failure message names the file and the rule.

### 3.5 npm scripts
| Script | Command |
|---|---|
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `lint` | `eslint . --max-warnings=0` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` (unchanged) |
| `test:e2e` | `playwright test` (unchanged) |
| `check` | `npm run format:check && npm run lint && npm run typecheck && npm test` |
| `prepare` | `husky` |

### 3.6 Git hooks (Husky + lint-staged + commitlint)
- **`.husky/pre-commit`:** `npx lint-staged`.
  - lint-staged config: `*.{ts,tsx,mjs,js}` → `eslint --fix --max-warnings=0`, then `prettier --write`; `*.{json,md,css,yml,yaml}` → `prettier --write`.
- **`.husky/commit-msg`:** `npx --no -- commitlint --edit "$1"`.
- **`commitlint.config.mjs`:**
  - extends `@commitlint/config-conventional`;
  - the allowed types are `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`, `ci`, `build`, `revert`;
  - a local plugin rule `no-ai-attribution` (error) rejects a message whose text matches `/co-authored-by:.*(claude|anthropic)/i` or `/generated with \[?claude code/i`.
- **`.husky/pre-push`:** `npm run typecheck && npm run lint`.

### 3.7 Claude Code hooks (`.claude/settings.json`, committed; scripts in `.claude/hooks/`, executable, LF)
- **PostToolUse**, matcher `Edit|Write|MultiEdit`: `.claude/hooks/format-and-lint.sh`.
  - It reads the hook JSON from stdin and takes `tool_input.file_path`. If the file is a lintable or formattable file inside the repo, it runs `prettier --write` on it, then `eslint --fix --max-warnings=0` for ts/tsx/js/mjs.
  - If ESLint still reports errors, it prints them to stderr and exits with code 2, so the agent sees them and fixes them. Otherwise it exits 0.
- **PreToolUse**, matcher `Bash`: `.claude/hooks/guard-bash.sh`. It reads `tool_input.command` and **blocks** (exit 2 with a reason) when the command matches any of these:
  - `prisma migrate reset`;
  - `git commit` or `git push` containing `--no-verify` or `-n` as a commit flag;
  - `git push` with `--force`/`-f`/`--force-with-lease` whose refspec targets `master` (or a bare force push while on `master`);
  - `git commit` whose command text contains `Co-Authored-By` with Claude/Anthropic, or "Generated with Claude".
  Anything else exits 0.
- **Permissions allow-list:** `Bash(npm run lint*)`, `Bash(npm run typecheck*)`, `Bash(npm run test*)`, `Bash(npm run format*)`, `Bash(npm run check*)`, `Bash(npm test*)`, `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`.
- **Tests:** both hook scripts are tested in `tests/hooks.test.ts` (Vitest spawns the script with sample JSON on stdin and asserts the exit code and output), covering every blocked pattern plus allowed look-alikes (e.g. `git commit -m "fix: reset form"`).

## 4. CI and PR flow

### 4.1 `.github/workflows/ci.yml`
- **Triggers:** `pull_request` and `push` to `master`. Concurrency group per ref with `cancel-in-progress: true`.
- **Setup:**
  - `actions/checkout` and `actions/setup-node` pinned to major versions, with `node-version-file: .nvmrc` and `cache: npm`.
  - Workflow-level `env` copied from `.env.test`, with `DATABASE_URL` pointing at the service on `localhost:5432` (test-only values).
- **Jobs:**
  - **`quality`** (no database): `npm ci` → `npm run format:check` → `npm run lint` → `npm run typecheck`.
  - **`test`:**
    - Service `postgres:16` (user/password `postgres`, database `lastdigit_test`, health check `pg_isready`) on port 5432.
    - Steps: `npm ci` → `npm test`. Vitest's global setup runs `prisma migrate deploy`.
  - **`e2e`:**
    - `needs: test`, with the same Postgres service.
    - Steps: `npm ci`, a cached `~/.cache/ms-playwright`, `npx playwright install --with-deps chromium`, `npm run test:e2e`.
    - On failure, upload `playwright-report/` and `test-results/` as an artifact.
- `playwright.config.ts` and `vitest.config.ts` must respect a `DATABASE_URL` already set in the environment in CI. `.env.test` stays the local default: load it with `override: false` when `process.env.CI` is set.

### 4.2 `.github/workflows/pr-title.yml`
`amannn/action-semantic-pull-request` (pinned major) on `pull_request_target` types `opened`, `edited`, `synchronize`, with the same type list as commitlint.

### 4.3 PR template (`.github/pull_request_template.md`)
- Sections: Summary · Spec / plan links · How it was tested.
- Checklist:
  - [ ] tests added/updated;
  - [ ] `npm run check` passes;
  - [ ] migrations included if the schema changed;
  - [ ] no secrets;
  - [ ] no AI attribution lines.

### 4.4 Branch protection (`master`, applied with `gh api` after the harness PR merges)
- PRs required, with 0 approvals.
- Required status checks: `quality`, `test`, `e2e`, plus the PR-title check. Branches must be up to date before merging (strict).
- No force pushes, no deletions.
- Admins are not exempt (`enforce_admins: true`).
- The repo's merge settings allow **squash merge only**, using the PR title as the commit message.

## 5. Supporting files
- `.nvmrc`: `24`.
- `package.json`: `"engines": { "node": ">=24" }`.
- `.editorconfig`: `root = true`; for all files `end_of_line = lf`, `indent_style = space`, `indent_size = 2`, `insert_final_newline = true`, `charset = utf-8`, `trim_trailing_whitespace = true` (except `*.md`).
- `.gitattributes`: `* text=auto eol=lf`, and `*.sh text eol=lf`.
- `.gitignore` additions: `.superpowers/`, `/playwright-report/` (`/test-results/` is already there).

## 6. Rollout (commits on `chore/harness`)
1. `docs: add engineering harness design spec` (this file).
2. `build: add prettier, eslint plugins, husky, lint-staged, commitlint` (dependencies and config, with the formatting rule not yet applied to the code).
3. `style: format repository with prettier` (formatting only).
4. `refactor: satisfy stricter lint and TypeScript rules` (code fixes; all tests stay green).
5. `test: add architecture invariant tests`.
6. `chore: add Claude Code guard and format hooks` (with `tests/hooks.test.ts`).
7. `ci: add GitHub Actions, PR template and PR title check`.
8. `docs: add CLAUDE.md, CONTRIBUTING.md and engineering standards`.

Then: open the PR → CI green → the user merges → the controller applies branch protection and squash-only merge settings → `feat/redesign` is rebased onto the new `master`.

## 7. Testing and verification
- `npm run check` passes locally. `npm run test:e2e` passes locally.
- `tests/architecture.test.ts` passes on the fixed code. Before relying on it, each check is shown to fail with a temporary violation (in the TDD RED step) and that violation is removed.
- `tests/hooks.test.ts` covers the blocked and allowed command cases and the format/lint feedback (exit 2 with a message when lint errors remain).
- **Manual:**
  - `git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"` is rejected by commitlint.
  - A file with a lint error, staged and committed, is fixed by lint-staged or blocks the commit.
- **CI:** all jobs are green on the harness PR, and a deliberately failing push (lint error) shows `quality` failing. This can be verified once on a throwaway branch and then deleted.
