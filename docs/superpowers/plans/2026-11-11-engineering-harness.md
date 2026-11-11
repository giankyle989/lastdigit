# LastDigit Engineering Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add code standards, enforced rules and a CI/PR workflow to the LastDigit repo, so every change made by a human or an agent is formatted, linted, type-checked, tested and reviewed the same way.

**Architecture:**
- Local enforcement in three layers:
  - editor/agent time: Claude Code hooks;
  - commit time: Husky + lint-staged + commitlint;
  - push time: typecheck + lint.
- Remote enforcement: GitHub Actions with required checks on a protected `master`.
- Written rules in `CLAUDE.md`, `CONTRIBUTING.md` and `docs/engineering/standards.md`. Architecture invariants are pinned by Vitest tests that scan the source.

**Tech Stack:** Prettier 3.9.10 + prettier-plugin-tailwindcss 0.8.1, ESLint 9 (existing `eslint-config-next` 15.5.29 + its typescript-eslint v8), eslint-plugin-simple-import-sort 14.0.0, eslint-config-prettier 10.1.8, Husky 9.1.7, lint-staged 17.6.0, @commitlint/cli + config-conventional 21.2.4, GitHub Actions, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-11-engineering-harness-design.md`. Read it before any task. It is the binding authority.

## Global Constraints

- Work on branch `chore/harness` in `/home/kyle/lastdigit`. Never switch branches. Never commit `.superpowers/`, `.env`, `test-results/` or `playwright-report/`.
- **Commit messages:**
  - follow Conventional Commits;
  - must never contain `Co-Authored-By:` lines naming Claude or Anthropic, or "Generated with Claude Code";
  - must not have any attribution trailer at all.
- Never run `prisma migrate reset`. This plan has no schema changes.
- Pin new devDependencies to the **exact** versions in the Tech Stack line (`npm i -D -E`).
- Prettier config, verbatim: `{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 110, "plugins": ["prettier-plugin-tailwindcss"] }`.
- **New TypeScript options:** `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`, all `true`. Never disable them to get a green build. Fix the code.
- **No escape hatches:** no new `eslint-disable` comments, `@ts-ignore`, `@ts-expect-error` or `any`. The one exception is test code that deliberately builds invalid input (`as unknown as T` is allowed there).
- **Layer rules (spec §2.2):**
  - `src/lib` is pure (Prisma **types** only; `src/lib/db.ts` is the exception);
  - `src/server` has no `next/*`, `react`, `@/app` or `@/components` (`src/server/session.ts` may import `next/navigation` and `@/auth`);
  - `src/app` and `src/components` never import `@/lib/db`;
  - `src/components` never imports `@/server/*`.
- **Plan decisions** (refinements of the spec, recorded here):
  - Claude hook scripts are Node scripts (`.mjs`) rather than bash. They're portable, need no `jq`, and are testable with Vitest.
  - The CI Postgres service maps port `5433:5432`, so `.env.test` works unchanged and the configs need no CI-specific env handling.
  - `typescript-eslint` rules come from the plugin already registered by `eslint-config-next`; no separate `typescript-eslint` package.
  - Git hook files are added in Task 4, after the code is clean, so the one-time format and refactor commits are not blocked.
- The test suite needs Docker Postgres: `docker compose up -d`. `POSTGRES_PASSWORD` is in `.env`.
- JSX text must not contain raw `'` characters.

## Review Focus

1. **Look-alike shell commands** (e.g. `git commit -m "fix: reset form"`, `git commit -m "docs: explain --no-verify"`, `git log -n 5`, `git push --force origin feat/x`) must **not** be blocked by the guard hook. Test owner: Task 5.
2. **A bare `git push --force` on `master`** (no refspec) must be blocked, and the same command on another branch must be allowed. Test owner: Task 5 (temporary git repos).
3. **An agent editing a file outside the repo or a non-code file** (e.g. `/tmp/x.ts`, `README.md`, `image.png`) must not error; the format hook exits 0. Test owner: Task 5.
4. **Commit messages with attribution in any case or position** (`co-authored-by: claude`, a trailer after other trailers, `🤖 Generated with [Claude Code](...)`) must be rejected; normal trailers such as `Co-authored-by: Jane <jane@x.com>` must be allowed. Test owner: Task 4.
5. **Architecture scan false positives:** `select: { balance: true }` and `where: { balance: { lt: 0 } }` must not count as balance writes; a page whose guard is `const admin = await requireAdmin()` must pass. Test owner: Task 3.

---

## File Structure

```
.prettierrc.json, .prettierignore          formatting
eslint.config.mjs                          lint + layer boundaries (modified)
tsconfig.json                              stricter flags (modified)
.editorconfig, .gitattributes, .nvmrc      editor/line endings/node version
package.json                               scripts, engines, lint-staged, deps (modified)
commitlint.config.mjs                      Conventional Commits + no-ai-attribution rule
.husky/pre-commit, commit-msg, pre-push    git hooks
.claude/settings.json                      Claude Code hooks + permission allow-list
.claude/hooks/guard-bash.mjs               PreToolUse Bash guard
.claude/hooks/format-and-lint.mjs          PostToolUse format + lint feedback
tests/architecture/rules.ts                pure invariant checkers
tests/architecture.test.ts                 fixture tests + repo scan
tests/hooks.test.ts                        Claude hook script tests
tests/commitlint.test.ts                   commit message rule tests
.github/workflows/ci.yml                   quality / test / e2e jobs
.github/workflows/pr-title.yml             semantic PR title check
.github/pull_request_template.md           PR template
CLAUDE.md, CONTRIBUTING.md                 agent + contributor rules
docs/engineering/standards.md              full standards reference
README.md                                  link to standards, npm run check (modified)
```

---

### Task 1: Formatting and lint configuration + one-time format

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.nvmrc`
- Modify: `eslint.config.mjs`, `tsconfig.json`, `package.json`, `.gitignore`

**Interfaces:**
- Produces: the npm scripts `format`, `format:check`, `lint`, `typecheck`, `check`; the ESLint layer rules used by every later task.

- [ ] **Step 1: Install dev dependencies (exact versions)**

```bash
cd /home/kyle/lastdigit
npm i -D -E prettier@3.9.10 prettier-plugin-tailwindcss@0.8.1 eslint-plugin-simple-import-sort@14.0.0 eslint-config-prettier@10.1.8 husky@9.1.7 lint-staged@17.6.0 @commitlint/cli@21.2.4 @commitlint/config-conventional@21.2.4
```

- [ ] **Step 2: Prettier config**

`.prettierrc.json`:
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 110,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

`.prettierignore`:
```
.next
node_modules
package-lock.json
prisma/migrations
test-results
playwright-report
.superpowers
docs/superpowers
public
next-env.d.ts
*.tsbuildinfo
```

- [ ] **Step 3: Editor, line-ending and Node version files**

`.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`.gitattributes`:
```
* text=auto eol=lf
*.sh text eol=lf
*.mjs text eol=lf
```

`.nvmrc`:
```
24
```

Append to `.gitignore`:
```
# local tooling
.superpowers/
```

- [ ] **Step 4: Stricter TypeScript**

In `tsconfig.json` `compilerOptions`, add after `"strict": true,`:
```json
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
```

- [ ] **Step 5: ESLint config**

Replace `eslint.config.mjs` entirely:
```js
import { FlatCompat } from '@eslint/eslintrc'
import prettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

/** One `@typescript-eslint/no-restricted-imports` rule per layer (spec §2.2). Later blocks override earlier ones. */
function restrict(files, groups, message, ignores = []) {
  return {
    files,
    ignores,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: groups.map(({ group, allowTypeImports = false }) => ({ group, allowTypeImports, message })) },
      ],
    },
  }
}

const NEXT_REACT = [{ group: ['next', 'next/*'] }, { group: ['react', 'react-dom', 'react/*'] }]
const UI = [{ group: ['@/app/*', '@/components/*'] }]

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'prisma/migrations/**',
      'test-results/**',
      'playwright-report/**',
      '.superpowers/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // Layer boundaries (spec §2.2)
  restrict(
    ['src/lib/**/*.{ts,tsx}'],
    [
      ...NEXT_REACT,
      ...UI,
      { group: ['@/server/*'] },
      { group: ['@/lib/db'] },
      { group: ['@prisma/client'], allowTypeImports: true },
    ],
    'src/lib must stay pure: no database, Next.js, React, server or UI imports (Prisma types only).',
    ['src/lib/db.ts'],
  ),
  restrict(
    ['src/server/**/*.{ts,tsx}'],
    [...NEXT_REACT, ...UI],
    'src/server holds domain logic: no Next.js, React or UI imports (only session.ts may use next/navigation).',
    ['src/server/session.ts'],
  ),
  restrict(
    ['src/server/session.ts'],
    [{ group: ['react', 'react-dom', 'react/*'] }, ...UI],
    'session.ts may use next/navigation and @/auth only.',
  ),
  restrict(
    ['src/app/**/*.{ts,tsx}'],
    [{ group: ['@/lib/db'] }],
    'src/app must not touch the database directly: call a src/server function.',
  ),
  restrict(
    ['src/components/**/*.{ts,tsx}'],
    [{ group: ['@/lib/db'] }, { group: ['@/server/*'] }],
    'src/components must not import the database or src/server: pass data in as props or call an action.',
  ),
  prettier,
]

export default eslintConfig
```

- [ ] **Step 6: npm scripts and engines**

```bash
npm pkg set scripts.format="prettier --write ."
npm pkg set scripts.format:check="prettier --check ."
npm pkg set scripts.lint="eslint . --max-warnings=0"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.check="npm run format:check && npm run lint && npm run typecheck && npm test"
npm pkg set engines.node=">=24"
```

- [ ] **Step 7: Verify the tools run (violations expected)**

Run: `npx prettier --check . ; npx eslint . --max-warnings=0 | tail -5 ; npx tsc --noEmit | tail -5`
Expected: all three **run** (no config or load errors) and report violations in existing code. Record the counts in the report. If ESLint reports a config error (e.g. "Cannot redefine plugin" or a projectService file not in a project), fix the config without dropping any rule from Step 5, and explain the fix in the report.

- [ ] **Step 8: Commit config (before formatting)**

```bash
git add .prettierrc.json .prettierignore .editorconfig .gitattributes .nvmrc .gitignore eslint.config.mjs tsconfig.json package.json package-lock.json
git commit -m "build: add prettier, eslint rules, strict tsconfig and tooling dependencies"
```

- [ ] **Step 9: One-time format of the repository**

Run: `npm run format && npm run format:check`
Expected: `All matched files use Prettier code style!`

Run: `npm test`
Expected: all tests pass (formatting only; no behavior change).

```bash
git add -A
git status --short | grep -E '\.superpowers|\.env$' && echo "STOP: unexpected files staged" || true
git commit -m "style: format repository with prettier"
```

---

### Task 2: Make existing code satisfy the strict lint and TypeScript rules

**Files:**
- Modify: whatever `npm run lint` and `npm run typecheck` flag under `src/`, `tests/`, `e2e/`, `prisma/` and root configs.

**Interfaces:**
- Consumes: Task 1 configs.
- Produces: a repo where `npm run check` passes. Later tasks rely on a clean baseline.

This task fixes violations reported by tools. Exact files depend on the tool output, so the steps give the procedure plus a fix recipe for each rule. Do not change behavior. Do not weaken any rule.

- [ ] **Step 1: Auto-fix what ESLint can fix**

Run: `npx eslint . --fix --max-warnings=0`
This fixes import order (`simple-import-sort`) and `consistent-type-imports` automatically. Then run `npm run format`.

- [ ] **Step 2: List the remaining problems**

Run: `npx eslint . --max-warnings=0 -f unix > /tmp/eslint.txt; wc -l /tmp/eslint.txt; npx tsc --noEmit > /tmp/tsc.txt; wc -l /tmp/tsc.txt`
Copy both outputs into the report before fixing.

- [ ] **Step 3: Fix each problem with these recipes**

| Rule / error | Fix |
|---|---|
| TS2532/TS18048 "possibly undefined" from `noUncheckedIndexedAccess` on `rows[0]` (e.g. `src/server/ledger.ts:31`) | `const row = rows[0]; if (!row) throw new DomainError('INSUFFICIENT_BALANCE', 'Insufficient balance'); balanceAfter = row.balance` (keep the existing error code/message for that path) |
| Same, in tests (`results[0].x`, `txs[0].user`) | `expect(x).toHaveLength(n)` first, then `const [first] = x; expect(first?.user.username).toBe(...)`, or `x.at(0)?.…`. In tests only, a guard `if (!first) throw new Error('missing row')` is fine |
| Same, for `Record`/map lookups (`myStakes[key]`, `SPLIT.get`) | Handle `undefined` explicitly (`?? 0`, an early return) |
| `no-non-null-assertion` (e.g. `src/app/(player)/games/[id]/page.tsx:19` `game.awayScore!`) | Narrow first: `const winning = hasFinal && game.awayScore !== null && game.homeScore !== null ? formatEnding(endingOf(game.awayScore, game.homeScore)) : undefined` |
| `no-non-null-assertion` on `process.env.X!` (`playwright.config.ts`) | Add a local `function requireEnv(name: string): string { const v = process.env[name]; if (!v) throw new Error(\`Missing env ${name} (.env.test)\`); return v }` in that file and use it |
| `no-floating-promises` | `await` the promise. In fire-and-forget event handlers use `void promise`. In top-level scripts (`prisma/seed.ts`) chain `.catch(...)` |
| `no-misused-promises` | Wrap the async callback: `onClick={() => void doThing()}` |
| `switch-exhaustiveness-check` | Add the missing `case`s. Add `default: { const _exhaustive: never = x; throw new Error(...) }` only where the type is a union you control |
| `@typescript-eslint/no-restricted-imports` (layer violation) | Move the import through the right layer: e.g. an `src/app` file importing `@/lib/db` must call a new or existing `src/server` query instead. Add a small server function plus a test if one doesn't exist |
| `no-explicit-any` | Use a real type, or `unknown` plus narrowing |
| `noImplicitOverride` | Add the `override` keyword |

- [ ] **Step 4: Verify the baseline is clean**

Run: `npm run check`
Expected: format check passes, `eslint` 0 problems, `tsc` 0 errors, all Vitest tests pass (144+).

Run: `npm run build`
Expected: the build succeeds.

Run: `npm run test:e2e`
Expected: 1 passed. Make sure nothing else is on port 3100 first (`ss -ltn | grep 3100`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: satisfy stricter lint and TypeScript rules"
```

---

### Task 3: Architecture invariant tests

**Files:**
- Create: `tests/architecture/rules.ts`, `tests/architecture.test.ts`

**Interfaces:**
- Produces:
  - `findBalanceWrites(source: string): number[]`: 1-based line numbers of balance writes.
  - `hasGuardCall(source: string, guard: 'requireUser' | 'requireAdmin'): boolean`.
  - `serverActionsMissingGuard(source: string, allow: readonly string[]): string[]`: exported async function names in a `'use server'` file whose bodies call neither guard.
  - `importsDb(source: string): boolean`.
  - `listFiles(dir: string, match: RegExp): string[]` (repo-relative, POSIX separators).
  - `AUTH_ACTION_ALLOWLIST = ['loginAction', 'signupAction', 'logoutAction'] as const`.

- [ ] **Step 1: Write failing fixture tests**

`tests/architecture.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AUTH_ACTION_ALLOWLIST,
  findBalanceWrites,
  hasGuardCall,
  importsDb,
  listFiles,
  serverActionsMissingGuard,
} from './architecture/rules'

const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('rule helpers (fixtures)', () => {
  it('detects balance writes', () => {
    expect(findBalanceWrites('a\ndata: { balance: { increment: 5 } }')).toEqual([2])
    expect(findBalanceWrites('data: { balance: { decrement: amount } }')).toEqual([1])
    expect(findBalanceWrites('data: { balance: 0 }')).toEqual([1])
    expect(findBalanceWrites('UPDATE "User" SET "balance" = 1')).toEqual([1])
    expect(findBalanceWrites('UPDATE "User" SET balance = balance + ${x}')).toEqual([1])
  })

  // Review Focus #5
  it('ignores balance reads and filters', () => {
    expect(findBalanceWrites('select: { balance: true }')).toEqual([])
    expect(findBalanceWrites('where: { balance: { lt: 0 } }')).toEqual([])
    expect(findBalanceWrites('orderBy: { balance: "asc" }')).toEqual([])
    expect(findBalanceWrites('const x = user.balance - 1')).toEqual([])
  })

  it('detects guard calls in pages', () => {
    expect(hasGuardCall('const admin = await requireAdmin()', 'requireAdmin')).toBe(true)
    expect(hasGuardCall('await requireAdmin()', 'requireAdmin')).toBe(true)
    expect(hasGuardCall('import { requireAdmin } from "x"', 'requireAdmin')).toBe(false)
    expect(hasGuardCall('await requireUser()', 'requireAdmin')).toBe(false)
  })

  it('finds server actions without a guard', () => {
    const src = [
      "'use server'",
      'export async function okAction(id: string) {',
      '  const u = await requireUser()',
      '  return u.id + id',
      '}',
      'export async function badAction() {',
      '  return 1',
      '}',
      'export async function loginAction() {',
      '  return 2',
      '}',
    ].join('\n')
    expect(serverActionsMissingGuard(src, AUTH_ACTION_ALLOWLIST)).toEqual(['badAction'])
    expect(serverActionsMissingGuard('export async function x() {\n}\n', [])).toEqual([])
  })

  it('detects db imports', () => {
    expect(importsDb("import { prisma } from '@/lib/db'")).toBe(true)
    expect(importsDb('import type { Tx } from "@/lib/db"')).toBe(true)
    expect(importsDb("import { x } from '@/lib/dbx'")).toBe(false)
  })
})

describe('repository invariants', () => {
  it('only the ledger writes User.balance', () => {
    const offenders = listFiles('src', /\.(ts|tsx)$/)
      .filter((f) => f !== 'src/server/ledger.ts')
      .flatMap((f) => findBalanceWrites(read(f)).map((line) => `${f}:${line}`))
    expect(offenders, 'balance must only change via postEntry() in src/server/ledger.ts').toEqual([])
  })

  it('every admin page calls requireAdmin()', () => {
    const missing = listFiles('src/app/admin', /page\.tsx$/).filter((f) => !hasGuardCall(read(f), 'requireAdmin'))
    expect(missing, 'admin pages must call await requireAdmin() themselves').toEqual([])
  })

  it('every player page calls requireUser()', () => {
    const missing = listFiles('src/app/(player)', /page\.tsx$/).filter((f) => !hasGuardCall(read(f), 'requireUser'))
    expect(missing, 'player pages must call await requireUser() themselves').toEqual([])
  })

  it('every server action calls a guard', () => {
    const missing = listFiles('src', /\.(ts|tsx)$/)
      .filter((f) => /^\s*['"]use server['"]/.test(read(f)))
      .flatMap((f) => serverActionsMissingGuard(read(f), AUTH_ACTION_ALLOWLIST).map((name) => `${f}#${name}`))
    expect(missing, 'server actions must call requireUser()/requireAdmin()').toEqual([])
  })

  it('app and components never import the database', () => {
    const offenders = [...listFiles('src/app', /\.(ts|tsx)$/), ...listFiles('src/components', /\.(ts|tsx)$/)].filter(
      (f) => importsDb(read(f)),
    )
    expect(offenders, 'use a src/server function instead of @/lib/db').toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/architecture.test.ts`
Expected: FAIL, `Cannot find module './architecture/rules'`.

- [ ] **Step 3: Implement the helpers**

`tests/architecture/rules.ts`:
```ts
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

export const AUTH_ACTION_ALLOWLIST = ['loginAction', 'signupAction', 'logoutAction'] as const

const BALANCE_WRITE_PATTERNS = [
  /\bbalance\s*:\s*\{\s*(increment|decrement|set|multiply|divide)\b/,
  /\bbalance\s*:\s*-?\d/,
  /"balance"\s*=/,
  /\bSET\s+balance\s*=/i,
]

export function findBalanceWrites(source: string): number[] {
  return source
    .split('\n')
    .flatMap((line, i) => (BALANCE_WRITE_PATTERNS.some((re) => re.test(line)) ? [i + 1] : []))
}

export function hasGuardCall(source: string, guard: 'requireUser' | 'requireAdmin'): boolean {
  return new RegExp(`\\bawait\\s+${guard}\\s*\\(`).test(source)
}

export function serverActionsMissingGuard(source: string, allow: readonly string[]): string[] {
  const missing: string[] = []
  const re = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g
  for (const match of source.matchAll(re)) {
    const name = match[1] ?? ''
    const body = match[2] ?? ''
    if (allow.includes(name)) continue
    if (!/\b(requireUser|requireAdmin)\s*\(/.test(body)) missing.push(name)
  }
  return missing
}

export function importsDb(source: string): boolean {
  return /from\s+['"]@\/lib\/db['"]/.test(source)
}

export function listFiles(dir: string, match: RegExp): string[] {
  const abs = path.join(ROOT, dir)
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (match.test(entry)) out.push(path.relative(ROOT, full).split(path.sep).join('/'))
    }
  }
  walk(abs)
  return out.sort()
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/architecture.test.ts`
Expected: all pass. If a **repository invariant** test fails, it found a real violation: fix the code (not the rule) and note it in the report.

- [ ] **Step 5: Prove the repo checks bite (temporary violation, then revert)**

Temporarily add `// probe\nconst _probe = { balance: { increment: 1 } }` at the end of `src/server/bets.ts`, then run `npx vitest run tests/architecture.test.ts -t "only the ledger"`.
Expected: FAIL naming `src/server/bets.ts:<line>`.
Revert with `git checkout src/server/bets.ts`, re-run, and expect PASS. Put both outputs in the report.

- [ ] **Step 6: Full check and commit**

Run: `npm run check`
Expected: green.

```bash
git add tests/architecture.test.ts tests/architecture/rules.ts
git commit -m "test: add architecture invariant tests"
```

---

### Task 4: Git hooks (Husky, lint-staged, commitlint)

**Files:**
- Create: `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`, `commitlint.config.mjs`, `tests/commitlint.test.ts`
- Modify: `package.json` (`prepare` script, `lint-staged` block)

**Interfaces:**
- Produces: commit rejection for non-conventional or AI-attributed messages. Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`, `ci`, `build`, `revert`.

- [ ] **Step 1: Write the failing test**

`tests/commitlint.test.ts`:
```ts
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'node_modules', '.bin', 'commitlint')

function lint(message: string) {
  const r = spawnSync(BIN, [], { cwd: ROOT, input: message, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('commitlint rules', () => {
  it('accepts conventional messages', () => {
    expect(lint('feat: add bet slip').code).toBe(0)
    expect(lint('fix(sync): isolate per-game failures\n\nDetails here.').code).toBe(0)
  })

  it('rejects non-conventional messages', () => {
    expect(lint('added stuff').code).not.toBe(0)
    expect(lint('feature: add thing').code).not.toBe(0)
  })

  // Review Focus #4
  it.each([
    'feat: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    'feat: x\n\nco-authored-by: claude <x@y.z>',
    'feat: x\n\nSigned-off-by: Kyle <k@x.com>\nCo-authored-by: Someone <noreply@anthropic.com>',
    'feat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    'feat: x\n\nGenerated with Claude Code',
  ])('rejects AI attribution: %s', (message) => {
    const r = lint(message)
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('no-ai-attribution')
  })

  it('allows normal co-author trailers', () => {
    expect(lint('feat: x\n\nCo-authored-by: Jane Doe <jane@example.com>').code).toBe(0)
  })
})
```

Run: `npx vitest run tests/commitlint.test.ts`
Expected: FAIL. There's no config yet, so commitlint errors with "Please add rules" or a non-zero exit even for valid messages, and the "accepts" test fails.

- [ ] **Step 2: commitlint config**

`commitlint.config.mjs`:
```js
const AI_ATTRIBUTION = [/co-authored-by:.*(claude|anthropic)/i, /generated with \[?claude code/i]

/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-attribution': (parsed) => {
          const raw = parsed.raw ?? ''
          const hit = AI_ATTRIBUTION.some((re) => re.test(raw))
          return [!hit, 'remove AI attribution lines (Co-Authored-By Claude/Anthropic, "Generated with Claude Code")']
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'style', 'perf', 'ci', 'build', 'revert'],
    ],
    'no-ai-attribution': [2, 'always'],
  },
}

export default config
```

Run: `npx vitest run tests/commitlint.test.ts`
Expected: PASS.

- [ ] **Step 3: Husky hooks and lint-staged**

```bash
npm pkg set scripts.prepare="husky"
npx husky init
```

Overwrite the generated `.husky/pre-commit`:
```sh
npx lint-staged
```

`.husky/commit-msg`:
```sh
npx --no -- commitlint --edit "$1"
```

`.husky/pre-push`:
```sh
npm run typecheck && npm run lint
```

```bash
chmod +x .husky/pre-commit .husky/commit-msg .husky/pre-push
npm pkg set 'lint-staged["*.{ts,tsx,js,mjs}"][0]'="eslint --fix --max-warnings=0"
npm pkg set 'lint-staged["*.{ts,tsx,js,mjs}"][1]'="prettier --write"
npm pkg set 'lint-staged["*.{json,md,css,yml,yaml}"][0]'="prettier --write"
```
Check `package.json` contains:
```json
"lint-staged": {
  "*.{ts,tsx,js,mjs}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{json,md,css,yml,yaml}": ["prettier --write"]
}
```
`npx husky init` may have added `"test"` to the pre-commit file or changed scripts. Make sure `.husky/pre-commit` contains only `npx lint-staged` and `scripts.test` is still `vitest run`.

- [ ] **Step 4: Manual hook verification**

```bash
git add -A
git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"   # must be REJECTED by commit-msg
git commit -m "bad message"                                                    # must be REJECTED
```
Paste both rejections into the report. Nothing should be committed. Check with `git log -1 --oneline`, which should still be the Task 3 commit.

- [ ] **Step 5: Commit**

Run: `npm run check`
Expected: green.

```bash
git add .husky commitlint.config.mjs tests/commitlint.test.ts package.json package-lock.json
git commit -m "build: add husky, lint-staged and commitlint hooks"
```
Expected: the pre-commit hook runs lint-staged, and the commit succeeds.

---

### Task 5: Claude Code guard and format hooks

**Files:**
- Create: `.claude/settings.json`, `.claude/hooks/guard-bash.mjs`, `.claude/hooks/format-and-lint.mjs`, `tests/hooks.test.ts`

**Interfaces:**
- Hook protocol (Claude Code): the hook receives JSON on stdin `{ "tool_name": string, "tool_input": {...}, "cwd": string, ... }`. Exit 0 means allow/continue. Exit 2 means block (PreToolUse), or feed stderr back to the agent (PostToolUse). Other exit codes are non-blocking errors.
- `guard-bash.mjs` reads `tool_input.command`. `format-and-lint.mjs` reads `tool_input.file_path`.

- [ ] **Step 1: Write the failing tests**

`tests/hooks.test.ts`:
```ts
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
const GUARD = path.join(ROOT, '.claude/hooks/guard-bash.mjs')
const FORMAT = path.join(ROOT, '.claude/hooks/format-and-lint.mjs')

function runHook(script: string, payload: object) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  })
  return { code: r.status, err: r.stderr }
}

const guard = (command: string, cwd = ROOT) => runHook(GUARD, { tool_name: 'Bash', tool_input: { command }, cwd })

function tempRepo(branch: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ld-hook-'))
  spawnSync('git', ['init', '-q', '-b', branch, dir])
  return dir
}

describe('guard-bash hook', () => {
  it.each([
    'npx prisma migrate reset --force',
    'cd /x && npx prisma migrate reset',
    'git commit --no-verify -m "feat: x"',
    'git commit -nm "feat: x"',
    'git push --no-verify origin feat/x',
    'git push --force origin master',
    'git push -f origin HEAD:master',
    'git push --force-with-lease origin master',
    'git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
    "git commit -F - <<'EOF'\nfeat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\nEOF",
  ])('blocks: %s', (cmd) => {
    const r = guard(cmd)
    expect(r.code).toBe(2)
    expect(r.err).toMatch(/Blocked by LastDigit harness/)
  })

  // Review Focus #1
  it.each([
    'git commit -m "fix: reset form"',
    'git commit -m "docs: explain --no-verify policy"',
    'git log -n 5',
    'git push --force origin feat/redesign',
    'git push origin master',
    'npx prisma migrate dev --name add_index',
    'npm test',
    'echo "do not run prisma migrate reset"',
  ])('allows: %s', (cmd) => {
    expect(guard(cmd).code).toBe(0)
  })

  // Review Focus #2
  it('blocks a bare force push while on master, allows it on another branch', () => {
    const onMaster = tempRepo('master')
    const onFeature = tempRepo('feat/x')
    try {
      expect(guard('git push --force', onMaster).code).toBe(2)
      expect(guard('git push --force', onFeature).code).toBe(0)
    } finally {
      rmSync(onMaster, { recursive: true, force: true })
      rmSync(onFeature, { recursive: true, force: true })
    }
  })

  it('ignores non-Bash payloads and malformed input', () => {
    expect(runHook(GUARD, { tool_name: 'Edit', tool_input: { file_path: 'x' } }).code).toBe(0)
    const r = spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8' })
    expect(r.status).toBe(0)
  })
})

describe('format-and-lint hook', () => {
  const tmpDir = path.join(ROOT, 'tests', '.tmp-hook')
  mkdirSync(tmpDir, { recursive: true })
  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }))

  const edit = (file_path: string) => runHook(FORMAT, { tool_name: 'Edit', tool_input: { file_path }, cwd: ROOT })

  it('formats a valid file and exits 0', () => {
    const file = path.join(tmpDir, 'ok.ts')
    writeFileSync(file, 'export const x   =   {a:1}\n')
    const r = edit(file)
    expect(r.code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe('export const x = { a: 1 }\n')
  }, 60_000)

  it('feeds remaining lint errors back with exit 2', () => {
    const file = path.join(tmpDir, 'bad.ts')
    writeFileSync(file, 'export const y: any = 1\n')
    const r = edit(file)
    expect(r.code).toBe(2)
    expect(r.err).toContain('no-explicit-any')
  }, 60_000)

  // Review Focus #3
  it.each(['/tmp/outside.ts', path.join(ROOT, 'public', 'missing.png')])('ignores %s', (file) => {
    expect(edit(file).code).toBe(0)
  })

  it('formats markdown without linting', () => {
    const file = path.join(tmpDir, 'note.md')
    writeFileSync(file, '# Title\n\n\n\nText\n')
    expect(edit(file).code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe('# Title\n\nText\n')
  }, 60_000)
})
```

Run: `npx vitest run tests/hooks.test.ts`
Expected: FAIL (the scripts don't exist).

- [ ] **Step 2: Guard hook**

`.claude/hooks/guard-bash.mjs`:
```js
#!/usr/bin/env node
// PreToolUse(Bash) guard for the LastDigit harness. Exit 2 blocks the command; stderr explains why.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const AI_ATTRIBUTION = [/co-authored-by:[^\n]*(claude|anthropic)/i, /generated with \[?claude code/i]

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return null
  }
}

function tokenize(segment) {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
}

const isQuoted = (t) => t.startsWith('"') || t.startsWith("'")

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function check(command, cwd) {
  if (/\bgit\s+commit\b/.test(command) && AI_ATTRIBUTION.some((re) => re.test(command))) {
    return 'commit messages must not contain AI attribution (Co-Authored-By Claude / Generated with Claude Code)'
  }
  const segments = command.split(/&&|\|\||;|\|/)
  for (const segment of segments) {
    const tokens = tokenize(segment.trim()).filter((t) => !isQuoted(t))
    const at = (word) => tokens.indexOf(word)

    const p = at('prisma')
    if (p !== -1 && tokens[p + 1] === 'migrate' && tokens[p + 2] === 'reset') {
      return 'prisma migrate reset is forbidden (destroys data); create a migration with prisma migrate dev --name <name>'
    }

    const g = at('git')
    if (g === -1) continue
    const sub = tokens[g + 1]
    const args = tokens.slice(g + 2)

    if ((sub === 'commit' || sub === 'push') && args.includes('--no-verify')) {
      return '--no-verify skips the git hooks; fix the reported problem instead'
    }
    if (sub === 'commit' && args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) {
      return 'git commit -n skips the git hooks; fix the reported problem instead'
    }
    if (sub === 'push') {
      const force = args.some((a) => a === '--force' || a === '-f' || a.startsWith('--force-with-lease'))
      if (!force) continue
      const refs = args.filter((a) => !a.startsWith('-'))
      const targetsMaster = refs.slice(1).some((r) => r === 'master' || r.endsWith(':master'))
      const bare = refs.length <= 1
      if (targetsMaster || (bare && currentBranch(cwd) === 'master')) {
        return 'force-pushing to master is forbidden'
      }
    }
  }
  return null
}

const input = readStdin()
if (!input || input.tool_name !== 'Bash') process.exit(0)
const reason = check(String(input.tool_input?.command ?? ''), input.cwd || process.cwd())
if (reason) {
  process.stderr.write(`Blocked by LastDigit harness: ${reason}\n`)
  process.exit(2)
}
process.exit(0)
```

- [ ] **Step 3: Format-and-lint hook**

`.claude/hooks/format-and-lint.mjs`:
```js
#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): format the edited file and feed remaining lint errors back (exit 2).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const FORMAT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.yml', '.yaml'])
const LINT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs'])
const bin = (name) => path.join(ROOT, 'node_modules', '.bin', name)

let input = null
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}

const file = input?.tool_input?.file_path
if (typeof file !== 'string' || !existsSync(file)) process.exit(0)
const abs = path.resolve(file)
const rel = path.relative(ROOT, abs)
if (rel.startsWith('..') || path.isAbsolute(rel)) process.exit(0)
const ext = path.extname(abs)
if (!FORMAT_EXT.has(ext)) process.exit(0)

spawnSync(bin('prettier'), ['--write', '--ignore-unknown', abs], { cwd: ROOT, encoding: 'utf8' })

if (LINT_EXT.has(ext)) {
  const r = spawnSync(bin('eslint'), ['--fix', '--max-warnings=0', '--no-warn-ignored', abs], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    process.stderr.write(`ESLint found problems in ${rel} (fix them now):\n${r.stdout}${r.stderr}`)
    process.exit(2)
  }
}
process.exit(0)
```

- [ ] **Step 4: Settings**

`.claude/settings.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint*)",
      "Bash(npm run typecheck*)",
      "Bash(npm run test*)",
      "Bash(npm run format*)",
      "Bash(npm run check*)",
      "Bash(npm test*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.mjs\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/format-and-lint.mjs\"" }]
      }
    ]
  }
}
```

Append `tests/.tmp-hook/` to `.gitignore` only. Do **not** add it to `.prettierignore` or the ESLint ignores: the hook tests rely on Prettier and ESLint processing files there. The tests delete the folder in `afterAll`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/hooks.test.ts`
Expected: all pass. The ESLint-backed tests take a few seconds each.

Run: `npm run check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add .claude tests/hooks.test.ts .gitignore
git commit -m "chore: add Claude Code guard and format hooks"
```

---

### Task 6: GitHub Actions, PR template and PR title check

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pr-title.yml`, `.github/pull_request_template.md`

**Interfaces:**
- Produces the check names that branch protection requires: `quality`, `test`, `e2e` (job ids in `ci.yml`) and `pr-title` (job id in `pr-title.yml`).

- [ ] **Step 1: CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: lastdigit_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm test

  e2e:
    needs: test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: lastdigit_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

Notes for the implementer:
- `.env.test` is committed and points at `localhost:5433/lastdigit_test`, matching the service port mapping. `vitest.config.ts` and `playwright.config.ts` load it, so no extra env block is needed.
- `npm ci` runs `prepare` (`husky`). Husky 9 does nothing outside a git work tree or in CI, which is fine.

- [ ] **Step 2: PR title workflow**

`.github/workflows/pr-title.yml`:
```yaml
name: PR title

on:
  pull_request_target:
    types: [opened, edited, synchronize, reopened]

permissions:
  pull-requests: read

jobs:
  pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            chore
            docs
            test
            refactor
            style
            perf
            ci
            build
            revert
```

- [ ] **Step 3: PR template**

`.github/pull_request_template.md`:
```markdown
## Summary

<!-- What changed and why, in 1–3 bullets. -->

## Spec / plan

<!-- Links to docs/superpowers/specs/... and docs/superpowers/plans/..., or "n/a" for small fixes. -->

## How it was tested

<!-- Commands run and results; manual checks. -->

## Checklist

- [ ] Tests added or updated (new behavior has a test; bug fixes start with a failing test)
- [ ] `npm run check` passes locally
- [ ] Migration included if the Prisma schema changed
- [ ] No secrets or `.env` values committed
- [ ] No AI attribution lines in commits or this description
```

- [ ] **Step 4: Validate the YAML locally**

Run: `npx prettier --check .github && node -e "for (const f of ['.github/workflows/ci.yml','.github/workflows/pr-title.yml']) { const s=require('fs').readFileSync(f,'utf8'); if (/\t/.test(s)) throw new Error(f+' has tabs'); } console.log('ok')"`
Expected: Prettier passes and `ok` is printed. Full validation happens when the PR runs on GitHub (final step of the plan).

- [ ] **Step 5: Commit**

```bash
git add .github
git commit -m "ci: add GitHub Actions, PR template and PR title check"
```

---

### Task 7: CLAUDE.md, CONTRIBUTING.md, standards doc, README

**Files:**
- Create: `CLAUDE.md`, `CONTRIBUTING.md`, `docs/engineering/standards.md`
- Modify: `README.md`

- [ ] **Step 1: CLAUDE.md**

`CLAUDE.md`:
````markdown
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

| Folder | Role | Must not import |
|---|---|---|
| `src/lib/` | pure helpers: game math, validation, formatting, dates | `@/lib/db` (except db.ts), `@/server/*`, `next/*`, `react`, UI |
| `src/server/` | domain services + queries — the only home of business rules | `next/*`, `react`, `@/app/*`, `@/components/*` (session.ts may use next/navigation, @/auth) |
| `src/app/` | pages, layouts, server actions — thin: guard → validate → call src/server → revalidate/redirect | `@/lib/db` |
| `src/components/` | UI | `@/lib/db`, `@/server/*` |

## Hard rules

1. `User.balance` changes only through `postEntry()` (`src/server/ledger.ts`).
2. Every page and every exported server action calls `requireUser()` / `requireAdmin()` itself (exceptions: login/signup/logout actions). Never rely on a layout guard.
3. Validate all external input (forms, search/route params, API data) with zod in `src/server` or at the action boundary.
4. Money-like state changes run in a transaction with a row lock or a conditional update; lock multiple rows in ascending id order.
5. Never run `prisma migrate reset`. Schema changes = committed migration.
6. Conventional Commits (`feat|fix|chore|docs|test|refactor|style|perf|ci|build|revert`). **Never add `Co-Authored-By: Claude…` or "Generated with Claude Code" to commits or PRs.**
7. Branch → PR → green CI → squash merge. Never commit `.env`, secrets, `.superpowers/`, test artifacts. Never use `--no-verify`.

## Workflow

- Features: spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → tasks with review → whole-branch review → PR.
- Small fixes: branch → failing test → fix → PR.
- Tests: TDD; server logic tested against real Postgres (`tests/integration`), no DB mocks.
- Hooks: an edited file is auto-formatted and linted; remaining lint errors are fed back — fix them before moving on.
````

- [ ] **Step 2: Standards reference**

`docs/engineering/standards.md`:
````markdown
# Engineering standards

These rules apply to every change, by humans or agents. Most are enforced automatically (ESLint, TypeScript, `tests/architecture.test.ts`, git hooks, Claude Code hooks, CI); the rest are checked in review.

## 1. Layers

| Folder | Role | May import | Must not import |
|---|---|---|---|
| `src/lib/` | pure code | other `src/lib`, `zod`, Prisma types | `@/lib/db` (except `db.ts`), `@/server/*`, `next/*`, `react`, `@/app/*`, `@/components/*` |
| `src/server/` | domain services + queries | `src/lib`, Prisma | `next/*`, `react`, `@/app/*`, `@/components/*` (`session.ts` may use `next/navigation`, `@/auth`) |
| `src/app/` | routes, server actions | anything else | `@/lib/db` |
| `src/components/` | UI | `src/lib`, `@/app/**/actions` | `@/lib/db`, `@/server/*` |

Pages and actions follow: **guard → validate → call `src/server` → revalidate/redirect.**

Good (`src/app/admin/actions.ts`):
```ts
export async function voidGameAction(gameId: string, _prev: ActionState, fd: FormData) {
  const admin = await requireAdmin()
  const r = await runAction(() => voidGame(admin.id, gameId, fd.get('reason')), 'Game voided')
  revalidatePath('/admin/games')
  return r
}
```
Bad: a page that imports `prisma` and updates rows itself.

## 2. Hard rules

1. **Ledger only.** `User.balance` changes only via `postEntry()` in `src/server/ledger.ts`, which writes a `Transaction` row in the same DB transaction.
2. **Guards everywhere.** Every `page.tsx` and every exported server action calls `requireUser()`/`requireAdmin()` in its own body. Layouts can be skipped by crafted RSC requests, so a layout guard is never enough.
3. **Validate input** with zod (`intFromForm` for numeric form fields) before it reaches domain logic.
4. **Concurrency.** Money-like changes run in `prisma.$transaction` with `SELECT … FOR UPDATE` or a conditional `updateMany` (e.g. `where: { status: 'FINAL' }`). Lock multiple rows in ascending id order.
5. **Migrations.** `npx prisma migrate dev --name <name>`; commit the migration. Never `prisma migrate reset`.
6. **Commits.** Conventional Commits; no AI attribution lines.
7. **Flow.** Branch → PR → green CI → squash merge. No `--no-verify`, no secrets.

## 3. Principles

- **TDD.** Write the failing test first; bug fixes start with a reproducing test. Server logic is tested against real Postgres.
- **Errors.** Expected failures throw `DomainError` (shown via `runAction`). Never swallow errors — log and count, or rethrow.
  Good: `catch (e) { console.error('sync: settle failed', g.id, e); result.errors++ }` · Bad: `catch {}`.
- **Naming.** Functions are verbs (`placeBets`); reads start with `get`/`list`/`search`. Files kebab-case; components PascalCase.
- **Size.** One responsibility per file; split past ~300 lines. YAGNI — no speculative options.
- **Types.** No `any`, no non-null `!`, `as` only at validated boundaries, exhaustive `switch`, `import type` for types. `noUncheckedIndexedAccess` is on: handle `rows[0]` being `undefined`.
- **UI.** Every interactive control has an accessible name; no raw `'` in JSX text; client components never touch the database.

## 4. Tooling

| When | What runs |
|---|---|
| Agent edits a file | `.claude/hooks/format-and-lint.mjs` (Prettier + ESLint; errors fed back) |
| Agent runs a shell command | `.claude/hooks/guard-bash.mjs` (blocks migrate reset, `--no-verify`, force-push to master, AI attribution) |
| `git commit` | lint-staged (ESLint --fix + Prettier on staged files), commitlint |
| `git push` | `npm run typecheck && npm run lint` |
| PR / push to master | CI: `quality`, `test` (Postgres), `e2e` (Playwright), PR title check |
````

- [ ] **Step 3: CONTRIBUTING.md**

`CONTRIBUTING.md`:
````markdown
# Contributing to LastDigit

## Setup

```bash
nvm use                      # Node 24 (.nvmrc)
npm install                  # also installs git hooks (husky)
cp .env.example .env         # fill POSTGRES_PASSWORD (match DATABASE_URL), AUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD
docker compose up -d
npx prisma migrate dev
npm run db:seed
npm run dev
```

## Branches and commits

- Branch from `master`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org): `feat: add bet slip`, `fix(sync): …`. Allowed types: feat, fix, chore, docs, test, refactor, style, perf, ci, build, revert.
- No AI attribution lines (`Co-Authored-By: Claude…`, "Generated with Claude Code") — commitlint rejects them.

## Workflow

1. Features: write a spec in `docs/superpowers/specs/`, then a plan in `docs/superpowers/plans/`, then implement task by task with tests first.
2. Run `npm run check` (and `npm run test:e2e` for UI changes) before pushing.
3. Open a PR using the template; the title must be a Conventional Commit (it becomes the squash commit message).
4. CI (`quality`, `test`, `e2e`, PR title) must be green. `master` is protected: PRs only, no force pushes.

## Standards

Read `docs/engineering/standards.md`. The essentials are in `CLAUDE.md`.
````

- [ ] **Step 4: README pointer**

In `README.md`, under the `## Tests` section, add:
```markdown
Before pushing, run `npm run check` (format, lint, typecheck, tests). See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/engineering/standards.md](docs/engineering/standards.md).
```

- [ ] **Step 5: Verify and commit**

Run: `npm run check`
Expected: green (Prettier formats the new markdown via lint-staged on commit as well).

```bash
git add CLAUDE.md CONTRIBUTING.md docs/engineering/standards.md README.md
git commit -m "docs: add CLAUDE.md, CONTRIBUTING.md and engineering standards"
```

---

## Post-implementation (controller, not an implementer task)

1. Push `chore/harness` and open the PR (`chore: add engineering harness`), with no AI attribution. Confirm the CI jobs `quality`, `test`, `e2e` and `pr-title` all run and pass. Fix any failures through the normal review loop.
2. Optional proof that CI catches failures: push a throwaway branch with a lint error, confirm `quality` fails, then delete the branch.
3. After the **user** merges the PR, apply the repo settings and branch protection:
   ```bash
   gh api -X PATCH repos/giankyle989/lastdigit -f allow_squash_merge=true -f allow_merge_commit=false -f allow_rebase_merge=false -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY -F delete_branch_on_merge=true
   gh api -X PUT repos/giankyle989/lastdigit/branches/master/protection --input - <<'JSON'
   {
     "required_status_checks": { "strict": true, "contexts": ["quality", "test", "e2e", "pr-title"] },
     "enforce_admins": true,
     "required_pull_request_reviews": { "required_approving_review_count": 0 },
     "restrictions": null,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   JSON
   ```
4. Rebase `feat/redesign` onto the new `master`. It only contains the redesign spec commit.
