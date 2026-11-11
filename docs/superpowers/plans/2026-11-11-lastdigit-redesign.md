# LastDigit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild LastDigit's UI as a dark "Neon Sportsbook": a phone-first player app (games feed, ending pickers, pool heatmap, estimated payout, an all-or-nothing bet slip) and an admin console (overview with charts, searchable server-driven tables with URL-bound drawers). Game rules, points and the ledger stay the same.

**Architecture:**
- The domain layer grows a little:
  - `placeBets` places a whole slip in one transaction;
  - new read queries feed the feed, the slip, the wallet and the admin tables;
  - `estimatePayout` is pure math in `src/lib`.
- Pages stay thin server components (guard → parse params → query → render). Interactivity lives in small client components under `src/components`, which get data only via props or the server actions in `src/app/**/actions.ts`.
- Admin tables are server-rendered from search params (`q`, `sort`, `page`, filters). Drawers are a client `Sheet` opened by a search param (`?player=` / `?game=` / `?ticket=`), so they can be linked to.
- The bet slip is client state in `localStorage`, refreshed from the server through `getSlipStatusAction` and confirmed through `placeBetsAction`.

**Tech Stack:** Next.js 15.5.29 (App Router, React 19.1), Tailwind CSS 4, shadcn/ui via `shadcn@4.23.0` (Radix base, `radix-ui@1.8.1`, `class-variance-authority@0.7.1`, `cn@0.5.2`, `lucide-react@1.70.0`, `sonner@2.0.8`, `tw-animate-css@1.4.0`), Recharts 3.10.1 (+ `react-is@19.1.0` peer), Prisma 6.19.3 + Postgres 16, zod 3, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-lastdigit-redesign-design.md`. Read it before any task. It is the binding authority; this plan records the decisions where the spec is silent (see "Plan decisions" below).

## Global Constraints

- **Branch:** work on `feat/redesign` in `/home/kyle/lastdigit` and never switch branches. Never commit `.env`, `.superpowers/`, `test-results/` or `playwright-report/`.
- **Harness rules (`CLAUDE.md`, `docs/engineering/standards.md`) bind every task:**
  - **Layers (ESLint and `tests/architecture.test.ts` enforce them):**
    - `src/lib` is pure (Prisma **types** only);
    - `src/server` has no `next/*`, `react` or UI imports;
    - `src/app` and `src/components` never import `@/lib/db`;
    - `src/components` never imports `@/server/*`, not even `import type`. Data comes in as props or through `src/app/**/actions.ts`.
  - **Guards:**
    - every `page.tsx` under `src/app/admin` calls `await requireAdmin()` itself, and every one under `src/app/(player)` calls `await requireUser()`;
    - every exported server action is written as `export async function` and calls `await requireUser()`/`await requireAdmin()` in its own body (only login, signup and logout are exempt);
    - `tests/unit/admin-page-guards.test.ts` must list every page, and Task 7 makes it fail when one is missing.
  - **Data rules:**
    - `User.balance` changes only through `postEntry()`;
    - money-like changes run in `prisma.$transaction` with row locks taken in ascending id order;
    - all external input (forms, search params, action arguments) is validated with zod or a `src/lib` parser before it reaches domain logic.
  - **Migrations:** never run `prisma migrate reset`. Create migrations with `npx prisma migrate dev --name <name>` (dev DB). Tests apply them with `migrate deploy`.
  - **Code:** no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `any` or non-null `!`. `noUncheckedIndexedAccess` is on, so handle `arr[0]` being `undefined`. Use `import type` for types. JSX text never contains a raw `'` (use `&apos;`).
  - **Commits:**
    - run `npm run check` (format, lint, typecheck, unit + integration tests; needs `docker compose up -d`) before every commit;
    - code in this plan is Prettier-formatted, but small edits it describes may leave long lines, so run `npx prettier --write` and `npx eslint --fix` on the files you touched (the Claude Code edit hook already does this) before `npm run check`;
    - use Conventional Commits;
    - **a commit message has no `Co-Authored-By` line and no AI attribution of any kind ("Generated with…", `noreply@anthropic.com`)**;
    - never use `--no-verify`, `git commit -n` or `HUSKY=0`.
- **Dependencies:** pin exactly (`npm i -E` / `npm i -D -E`) to the versions in the Tech Stack line. npm 11.21+ skips dependency install scripts by default. None of the new packages has one (checked with `npm query`), and the existing ones (`@prisma/client`, `@prisma/engines`, `esbuild`) already work with `npx prisma generate`. Task 1 re-checks this.
- **shadcn/ui:** generated files live in `src/components/ui/` and are committed. They must pass the repo's ESLint and Prettier as-is: run `npx eslint --fix` + `npx prettier --write` on them (this only sorts imports and reformats). Never disable a rule for them. Customizations are listed in full in Task 1.
- **Theme naming:** the spec's `accent` token (#39ff88) is shadcn's `primary` (`bg-primary`, `text-primary`, `ring`). shadcn's own `accent` is the hover surface. The project tokens `surface`, `surface-2`, `live`, `danger`, `info` are Tailwind colors (`bg-surface-2`, `text-live`, …). Monospace numbers use the `num` utility (`font-mono tabular-nums`).
- **Manual checks:**
  - run `npm run dev -- -p 3005` (never 3000/3100) with `docker compose up -d` and a seeded dev DB;
  - log in as the `ADMIN_USERNAME` from `.env`, or as a player you sign up;
  - stop the server (Ctrl+C) when done.
- **E2E:** `npm run test:e2e` builds with `next build --turbopack` and serves on port 3100. Tasks 7–15 change the flows the old E2E drives, so the E2E is only run again in Task 16, which rewrites it. Each task's gate until then is `npm run check` plus its manual check.
- **No `loading.tsx` and no `<Suspense>` in pages.** In Next 15.5.29 production builds, a `loading.tsx` or a page-level `<Suspense>` boundary made same-route client transitions hang intermittently: search-param links (sort, date strip, tabs), drawer links and server-action refreshes. The URL never updated and `useActionState` stayed pending. This was reproduced while writing this plan; webpack and turbopack builds both hang, the dev server does not. Pages render without streaming boundaries. Pending feedback comes from button states ("Working…", "Placing…"). Task 16 adds a test that pins this rule.
- **Plan decisions (where the spec is silent or conflicts with the above):**
  - **Skeletons:** spec §3.6 asks for `loading.tsx` skeletons. They are replaced by the rule above; `error.tsx` (message + Retry) is still added for every segment.
  - **`ActionForm` feedback:** success shows as a toast and errors stay inline under the form (role=alert). Bet-slip errors are toasts, and the failing pick is highlighted.
  - **Slip toast:** "1 bet placed" / "N bets placed".
  - **`getSlipStatus(userId, picks)`:** also returns the user's fresh `balance` (this is what `userId` is for).
  - **Slip storage:** `localStorage["lastdigit.slip.<userId>"]` holds `{ picks, lastStake }`. Each pick also stores a display-only `matchup` string, which is never sent to the server.
  - **`getEndingStakes().pool`:** the sum of non-refunded stakes.
  - **Pagination:** a page past the end clamps to the last page; malformed values fall back to 1.
  - **Sort toggling:** a sort header flips the direction of the active field; a new field starts ascending.
  - **Search scope:**
    - Players `q` is a username substring;
    - Games `q` is a team-abbreviation substring;
    - Ledger `q` is a username substring (the spec's "username" filter);
    - Support `q` matches the subject or the username.
  - **Logout:** players log out from More → Account; admins from the console header.
  - **Redirect:** `/admin/players/:id` → `/admin/players?player=:id` (permanent) is added, since the detail page becomes the drawer.
  - **Suspension:** the suspension end date stays a UTC date (as today). Unsuspend is a single button without a dialog.
  - **E2E viewport:** the `iphone` Playwright project uses the iPhone 13 viewport, touch and user agent on **Chromium** (CI installs only Chromium).

### E2E contract (labels the UI tasks must render exactly and Task 16 relies on)

| Where | Element | Accessible name / text | Task |
|---|---|---|---|
| `/signup`, `/login` | inputs | `Username`, `Password`, `Referral code (optional)` | 7 |
| `/signup`, `/login` | submit | button `Sign up` / `Log in` | 7 |
| logged-in visit to `/login` | redirect | to `/` → `/games` (player) or `/admin` (admin) | 7 |
| `/more` | logout | button `Log out` | 7 |
| admin header | logout | button `Log out` | 11 |
| `/more/referral` | code | `data-testid="referral-code"` | 10 |
| `/admin/players` | search | input labelled `Search players` (`?q=`) | 13 |
| `/admin/players` | row | link whose name is exactly the username | 11 + 13 |
| player drawer | sheet | dialog named by the username | 11 + 13 |
| player drawer | grant | button `Grant` → dialog fields `Amount`, `Note` → submit `Grant points` → toast `Points updated` | 13 |
| `/games/[id]` | pickers | buttons `LAL digit 9`, `GSW digit 6` (`<TEAM> digit <d>`) | 9 |
| `/games/[id]` | add | button `Add to slip` | 9 |
| phone slip bar | open | button whose name starts with `Open bet slip` | 8 |
| slip | confirm | button `Confirm bets` → toast `1 bet placed` | 8 |
| `/wallet` | balance | `data-testid="balance"` with text `990 pts` | 10 |
| `/wallet` | payout row | text exactly `Payout` | 10 |

## Review Focus

1. **Malformed URL params:** `?date=2026-02-30`, `?page=-1`, `?sort=passwordHash`, `?player=../x` and array params must fall back to defaults or show a "Not found" drawer, never a 500. Tests: Task 2 (`parseStripDate`), Task 5 (`parsePage`), Task 6 (`parseSort` with hostile fields, `parseEtDateParam`), Task 11 (`isRecordId`).
2. **Two overlapping slips confirmed at the same moment** (A: g1+g2, B: g2+g1) by one player with funds for only one: no deadlock, exactly one succeeds, the ledger stays consistent. Many players on shared games all succeed. Test: Task 4.
3. **A corrupted, foreign or oversized saved slip** in `localStorage` (bad JSON, `awayDigit: 12`, an array, more than 20 picks) loads as an empty slip instead of crashing the player layout. Junk stake input (`1e3`, `-5`, `1.5`) becomes 0, which disables Confirm. Tests: Task 8 (`tests/unit/slip.test.ts`). A throwing `localStorage` (private mode, blocked storage) is handled by the try/catch in `SlipProvider`'s `readStorage`/`writeStorage`; reviewers check it in Task 8.
4. **ET day edges:** an instant at 23:59:59 ET belongs to that ET day and 00:00:00 ET to the next, including the 23-hour and 25-hour DST days. This applies to the feed's day, the volume chart and today's top bettors. Tests: Task 2 (helpers) and Task 6 (`getDailyVolume`, `getTopBettorsToday`).
5. **Same-route client transitions must commit:** opening a drawer by clicking a row, changing sort/date/tab, and the refresh after a server action (e.g. Grant points) must update the URL and UI every time. No page may use `loading.tsx` or `<Suspense>` (see Global Constraints). Tests: Task 16 (`tests/unit/route-states.test.ts`, plus the E2E opening the drawer by a click and waiting for the `Points updated` toast on both projects).

---

## File Structure

```
components.json                                 shadcn config (Task 1)
next.config.ts                                  permanent redirects (Tasks 10, 15)
playwright.config.ts                            desktop + iphone projects (Task 16)
prisma/schema.prisma, prisma/migrations/*       Transaction(type, createdAt) index (Task 6)

src/lib/
  utils.ts                    shadcn `cn` re-export
  teams.ts                    team colors + readable text color
  dates.ts                    ET date helpers, date strip
  format.ts                   + signed points, countdown, tip-off time, ET day, relative time
  errors.ts, action-state.ts  DomainError.pickIndex, passed through runAction
  pagination.ts               firstParam, parsePage, pageWindow, Page<T>
  table-params.ts             sort whitelist, search, options, ET date bounds, toggleSort, isRecordId
  url.ts                      hrefWith, isActivePath
  slip.ts                     bet-slip reducer, limits, storage parsing
  my-bets.ts, wallet.ts       tab and filter definitions
  game/status.ts              display status (OPEN/CLOSED/…), isBettingOpen
  game/sections.ts            feed sections
  game/heat.ts                heatmap shade levels
  game/payout.ts              + estimatePayout
  game/ending.ts              + winningEnding
  game/limits.ts              MAX_SLIP_PICKS, MAX_STAKE

src/server/
  bets.ts                     placeBets (all-or-nothing) + placeBet wrapper
  queries/stakes.ts           getEndingStakes
  queries/player.ts           listGamesForDate, listMyBetsGrouped, listMyTransactions, getSlipStatus
  admin/overview.ts           getOverviewStats, getDailyVolume, getTopBettorsToday, getAdminBadges
  admin/tables/*.ts           players, games, ledger, tickets, admin-actions: parse params + paginated list
  admin/queries.ts            getPlayerDetail, getGameDetail (drawers)
  audit.ts                    ADMIN_ACTION_TYPES

src/components/
  ui/*                        shadcn (generated; sonner + card customized)
  team-badge, status-pill, points-amount, bet-result, tx-icon, countdown, action-form,
  empty-state, error-state, filter-chips, pagination, logout-button
  shell/                      player header + nav (top tabs / bottom tab bar)
  bet-slip/                   SlipProvider (+ localStorage), BetSlipPanel, SlipColumn / SlipBar
  games/                      DateStrip, GameCard, GameHeader, DigitPicker, EndingHeatmap, EndingPicker
  more/copy-share.tsx, support/chat-thread.tsx
  admin/                      nav, DataTable, UrlSheet, ActionDialog, FilterForm, SelectField, Field,
                              PageHeader, KpiTile, VolumeChart

src/app/
  layout.tsx, globals.css     fonts, theme tokens, Toaster, TooltipProvider
  (auth)/layout.tsx           centered auth card; login/signup restyled, logged-in redirect
  (player)/layout.tsx         shell + slip
  (player)/games, games/[id], bets, wallet, more, more/referral, more/support, more/support/[id]
  admin/layout.tsx            sidebar console
  admin/page.tsx              overview
  admin/players|games|ledger|support|settings  tables + drawers (drawer bodies co-located)
  **/error.tsx                error state per segment

tests/unit/                   teams, status, format, dates, payout, sections, table-params, slip, heat,
                              ending, redirects, route-states, admin-page-guards (extended)
tests/integration/            stakes, place-bets, player-feed, admin-overview, admin-tables, admin-details
e2e/full-flow.spec.ts         rewritten for the new flows
```

Removed along the way:
- `src/components/bet-grid.tsx`, `nav.tsx` and `inquiry-thread.tsx`;
- the pages `(player)/referral`, `(player)/inquiries/**`, `admin/players/[id]`, `admin/transactions` and `admin/inquiries/**`;
- the old queries `listUpcomingGames`, `listMyBets`, `getDashboardStats`, `searchPlayers`, `listGamesAdmin`, `listTransactionsAdmin`, the old `listAdminActions` and `listInquiriesAdmin`, together with their tests.

---

### Task 1: Design system — shadcn/ui, theme tokens, fonts, Toaster and base components

**Files:**
- Create (generated by the shadcn CLI): `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,card,badge,tabs,sheet,dialog,alert-dialog,table,input,label,select,sonner,skeleton,tooltip,dropdown-menu,textarea}.tsx`
- Create: `src/lib/teams.ts`, `src/lib/game/status.ts`, `src/components/team-badge.tsx`, `src/components/status-pill.tsx`, `src/components/points-amount.tsx`
- Modify: `package.json`, `package-lock.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/sonner.tsx`, `src/components/ui/card.tsx`, `src/lib/format.ts`, `src/components/action-form.tsx`, `src/components/countdown.tsx`
- Test: `tests/unit/teams.test.ts`, `tests/unit/status.test.ts`, `tests/unit/format.test.ts`

**Interfaces:**
- Produces:
  - `teamColor(abbr: string): string`, `teamTextColor(hex: string): '#0b0f14' | '#ffffff'`, `TEAM_COLORS`, `FALLBACK_TEAM_COLOR = '#334155'`;
  - `type DisplayStatus = 'OPEN' | 'CLOSED' | 'LIVE' | 'FINAL' | 'SETTLED' | 'VOID' | 'POSTPONED'`;
  - `displayStatus(game: { status: GameStatus; startsAt: Date }, now: Date): DisplayStatus`;
  - `isBettingOpen(game: { status: GameStatus; startsAt: Date }, now: Date): boolean`;
  - `formatSignedPoints(n: number): string`, `formatCountdown(ms: number): string`.
- Components:
  - `<TeamBadge abbr size?="sm"|"md"|"lg" />`;
  - `<StatusPill status={DisplayStatus} />`;
  - `<PointsAmount value signed? unit? className? />`, where `unit` appends `" pts"` in the same text node;
  - `<Countdown to={iso} />` calls `router.refresh()` once at 0;
  - `<ActionForm action submitLabel children? className? resetOnSuccess? onSuccess? confirm?={{title,description,actionLabel}} destructive? />`: success → `toast.success(state.ok)` + `onSuccess()`, error → inline `role="alert"`.
- Root layout mounts `<Toaster />` (sonner, top-center) and `<TooltipProvider>`. `toast` comes from `sonner`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/teams.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { FALLBACK_TEAM_COLOR, TEAM_COLORS, teamColor, teamTextColor } from '@/lib/teams'

describe('teams', () => {
  it('maps all 30 NBA teams to a hex color', () => {
    expect(Object.keys(TEAM_COLORS)).toHaveLength(30)
    for (const hex of Object.values(TEAM_COLORS)) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('looks up case-insensitively and falls back for unknown teams', () => {
    expect(teamColor('LAL')).toBe('#552583')
    expect(teamColor(' gsw ')).toBe('#1D428A')
    expect(teamColor('XYZ')).toBe(FALLBACK_TEAM_COLOR)
    expect(teamColor('')).toBe(FALLBACK_TEAM_COLOR)
  })

  it('picks readable badge text', () => {
    expect(teamTextColor('#C4CED4')).toBe('#0b0f14') // SAS silver
    expect(teamTextColor('#552583')).toBe('#ffffff')
    expect(teamTextColor('#000000')).toBe('#ffffff')
  })
})
```

`tests/unit/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { displayStatus, isBettingOpen } from '@/lib/game/status'

const tip = new Date('2026-11-12T00:00:00Z')
const before = new Date(tip.getTime() - 1)

describe('displayStatus', () => {
  it('shows SCHEDULED as OPEN before tip-off and CLOSED from tip-off on', () => {
    expect(displayStatus({ status: 'SCHEDULED', startsAt: tip }, before)).toBe('OPEN')
    expect(displayStatus({ status: 'SCHEDULED', startsAt: tip }, tip)).toBe('CLOSED')
  })

  it.each(['LIVE', 'FINAL', 'SETTLED', 'VOID', 'POSTPONED'] as const)('passes %s through', (status) => {
    expect(displayStatus({ status, startsAt: tip }, before)).toBe(status)
  })

  it('only SCHEDULED games before tip-off are open for bets', () => {
    expect(isBettingOpen({ status: 'SCHEDULED', startsAt: tip }, before)).toBe(true)
    expect(isBettingOpen({ status: 'SCHEDULED', startsAt: tip }, tip)).toBe(false)
    expect(isBettingOpen({ status: 'POSTPONED', startsAt: tip }, before)).toBe(false)
  })
})
```

`tests/unit/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { formatCountdown, formatPoints, formatSignedPoints } from '@/lib/format'

describe('format', () => {
  it('formats points with separators and signs', () => {
    expect(formatPoints(1200)).toBe('1,200')
    expect(formatSignedPoints(90)).toBe('+90')
    expect(formatSignedPoints(-100)).toBe('-100')
    expect(formatSignedPoints(0)).toBe('0')
  })

  it('formats countdowns', () => {
    expect(formatCountdown(2 * 3600_000 + 5 * 60_000 + 9_000)).toBe('2h 05m 09s')
    expect(formatCountdown(4 * 60_000 + 9_000)).toBe('4m 09s')
    expect(formatCountdown(-5)).toBe('0m 00s')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/teams.test.ts tests/unit/status.test.ts tests/unit/format.test.ts`
Expected: FAIL — `Cannot find module '@/lib/teams'` / `'@/lib/game/status'`, and `formatSignedPoints is not a function`.

- [ ] **Step 3: Initialise shadcn/ui and add the components (pinned CLI)**

```bash
cd /home/kyle/lastdigit
npx shadcn@4.23.0 init --base radix --preset nova --yes --no-monorepo --no-rtl
npx shadcn@4.23.0 add button card badge tabs sheet dialog alert-dialog table input label select sonner skeleton tooltip dropdown-menu textarea --yes
```

`init` writes `components.json` (style `radix-nova`, aliases `@/components`, `@/components/ui`, `@/lib/utils`) and `src/lib/utils.ts` (`export { cn } from "cn"`). It also rewrites `src/app/globals.css` and `src/app/layout.tsx`, but Steps 5–6 replace both files completely. The generated components import `cn` from the `cn` package directly. The CLI installs its dependencies with caret ranges and adds `next-themes` (used only by the stock Sonner wrapper), so re-pin them:

```bash
npm uninstall next-themes
npm i -E radix-ui@1.8.1 class-variance-authority@0.7.1 cn@0.5.2 lucide-react@1.70.0 sonner@2.0.8 tw-animate-css@1.4.0
npm i -D -E shadcn@4.23.0
```

`shadcn` is a devDependency: only `globals.css` imports it (`@import 'shadcn/tailwind.css'`, the `data-open:` / `data-closed:` variants that the components use), and only at build time.

Check that `package.json` now lists exactly `"class-variance-authority": "0.7.1"`, `"cn": "0.5.2"`, `"lucide-react": "1.70.0"`, `"radix-ui": "1.8.1"`, `"sonner": "2.0.8"`, `"tw-animate-css": "1.4.0"` under `dependencies` and `"shadcn": "4.23.0"` under `devDependencies`, with no `next-themes` and no caret on these. Then confirm that no new dependency needs an install script (npm 11.21+ skips them):

```bash
npm query ':attr(scripts, [postinstall]), :attr(scripts, [install]), :attr(scripts, [preinstall])' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).map(p=>p.name).join("\n")))'
```
Expected: only `@prisma/client`, `@prisma/engines`, `esbuild` and `prisma`, which were already there before this task (`npx prisma generate` covers Prisma).

Make the generated files pass the repo rules. This only sorts imports and reformats; it disables nothing:

```bash
npx eslint --fix src/components/ui src/lib/utils.ts
npx prettier --write src/components/ui src/lib/utils.ts components.json
npx eslint src/components/ui src/lib/utils.ts && npx prettier --check src/components/ui components.json
```
Expected: no output from ESLint; Prettier reports all files formatted.

- [ ] **Step 4: Customize two generated components**

`src/components/ui/sonner.tsx` — replace the whole file (dark only, no `next-themes`, theme colors):
```tsx
'use client'

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// Customized: dark-only theme (no next-themes), colors from the theme tokens.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="text-primary size-4" />,
        info: <InfoIcon className="text-info size-4" />,
        warning: <TriangleAlertIcon className="text-live size-4" />,
        error: <OctagonXIcon className="text-danger size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'bg-popover! text-popover-foreground! border-border! rounded-lg!',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
```

`src/components/ui/card.tsx` — the spec wants cards with a 1px border and no ring/shadow. In the root `Card` element's class string, replace the class `ring-foreground/10` with `border-border` and the class `ring-1` with `border`. Change nothing else. If a newer registry version words the string differently, the rule stays the same: replace the ring with a 1px `border border-border`.

- [ ] **Step 5: Theme tokens — replace `src/app/globals.css`**

The `.btn`/`.card`/`.input`/`.label`/`.table` block at the end restyles the MVP classes that existing pages still use. Task 16 deletes it.
```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';

@custom-variant dark (&:is(.dark *));

/* LastDigit "Neon Sportsbook" theme — dark only (spec §3.1).
   Spec "accent" (#39ff88) is shadcn's `primary`; shadcn's `accent` is the hover surface. */
:root {
  --radius: 0.625rem; /* 10px controls; rounded-xl = 14px cards */

  --background: #0b0f14;
  --foreground: #e6edf3;
  --card: #121821;
  --card-foreground: #e6edf3;
  --popover: #121821;
  --popover-foreground: #e6edf3;
  --primary: #39ff88;
  --primary-foreground: #0b0f14;
  --secondary: #151c24;
  --secondary-foreground: #e6edf3;
  --muted: #151c24;
  --muted-foreground: #8b9bb0;
  --accent: #1f2a36;
  --accent-foreground: #e6edf3;
  --destructive: #ef4444;
  --border: #1f2a36;
  --input: #1f2a36;
  --ring: #39ff88;

  --surface: #121821;
  --surface-2: #151c24;
  --live: #f5a524;
  --danger: #ef4444;
  --info: #3b82f6;
  --chart-1: #39ff88;
  --chart-2: #3b82f6;
}

@theme inline {
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains-mono);
  --font-heading: var(--font-inter);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-live: var(--live);
  --color-danger: var(--danger);
  --color-info: var(--info);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}

@utility num {
  @apply font-mono tabular-nums;
}

/* Legacy MVP classes, restyled to the theme so pages not yet redesigned stay readable.
   Task 16 deletes this block once no page uses them. */
@layer components {
  .btn {
    @apply bg-primary text-primary-foreground hover:bg-primary/80 inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50;
  }
  .btn-secondary {
    @apply border-border bg-surface-2 hover:bg-accent inline-flex items-center rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50;
  }
  .input {
    @apply border-input bg-surface-2 w-full rounded-lg border px-2 py-1.5 text-sm;
  }
  .label {
    @apply text-muted-foreground mb-1 block text-sm font-medium;
  }
  .card {
    @apply border-border bg-card rounded-xl border p-4;
  }
  .table {
    @apply w-full text-left text-sm;
  }
  .table th {
    @apply border-border text-muted-foreground border-b px-2 py-1.5 font-medium;
  }
  .table td {
    @apply border-border border-b px-2 py-1.5;
  }
}
```

- [ ] **Step 6: Fonts, Toaster and TooltipProvider — replace `src/app/layout.tsx`**

```tsx
import './globals.css'

import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'LastDigit',
  description: 'Bet points on the last digit of NBA final scores',
}

export const viewport: Viewport = { themeColor: '#0b0f14', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 7: Team colors and display status**

`src/lib/teams.ts`:
```ts
export const FALLBACK_TEAM_COLOR = '#334155'

/** Primary color per NBA team abbreviation (as returned by balldontlie). */
export const TEAM_COLORS: Readonly<Record<string, string>> = {
  ATL: '#E03A3E',
  BOS: '#007A33',
  BKN: '#000000',
  CHA: '#1D1160',
  CHI: '#CE1141',
  CLE: '#860038',
  DAL: '#00538C',
  DEN: '#0E2240',
  DET: '#C8102E',
  GSW: '#1D428A',
  HOU: '#CE1141',
  IND: '#002D62',
  LAC: '#C8102E',
  LAL: '#552583',
  MEM: '#5D76A9',
  MIA: '#98002E',
  MIL: '#00471B',
  MIN: '#0C2340',
  NOP: '#0C2340',
  NYK: '#006BB6',
  OKC: '#007AC1',
  ORL: '#0077C0',
  PHI: '#006BB6',
  PHX: '#1D1160',
  POR: '#E03A3E',
  SAC: '#5A2D81',
  SAS: '#C4CED4',
  TOR: '#CE1141',
  UTA: '#002B5C',
  WAS: '#002B5C',
}

export function teamColor(abbr: string): string {
  return TEAM_COLORS[abbr.trim().toUpperCase()] ?? FALLBACK_TEAM_COLOR
}

/** Dark text on light team colors, white text otherwise (WCAG relative luminance). */
export function teamTextColor(hex: string): '#0b0f14' | '#ffffff' {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  return luminance > 0.4 ? '#0b0f14' : '#ffffff'
}
```

`src/lib/game/status.ts`:
```ts
import type { GameStatus } from '@prisma/client'

export type DisplayStatus = 'OPEN' | 'CLOSED' | 'LIVE' | 'FINAL' | 'SETTLED' | 'VOID' | 'POSTPONED'

type GameTiming = { status: GameStatus; startsAt: Date }

export function isBettingOpen(game: GameTiming, now: Date): boolean {
  return game.status === 'SCHEDULED' && now < game.startsAt
}

/** SCHEDULED shows as OPEN before tip-off and CLOSED after it (spec §3.4). */
export function displayStatus(game: GameTiming, now: Date): DisplayStatus {
  switch (game.status) {
    case 'SCHEDULED':
      return isBettingOpen(game, now) ? 'OPEN' : 'CLOSED'
    case 'LIVE':
    case 'FINAL':
    case 'SETTLED':
    case 'VOID':
    case 'POSTPONED':
      return game.status
  }
}
```

Append to `src/lib/format.ts`:
```ts

export function formatSignedPoints(n: number): string {
  return n > 0 ? `+${formatPoints(n)}` : formatPoints(n)
}

/** "2h 05m 09s" / "4m 09s" — time left until tip-off. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${sec}s` : `${m}m ${sec}s`
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/teams.test.ts tests/unit/status.test.ts tests/unit/format.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 9: Base components**

`src/components/team-badge.tsx`:
```tsx
import { teamColor, teamTextColor } from '@/lib/teams'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-7 text-[10px]', md: 'size-9 text-xs', lg: 'size-12 text-sm' } as const

export function TeamBadge({ abbr, size = 'md' }: { abbr: string; size?: keyof typeof SIZES }) {
  const bg = teamColor(abbr)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold ring-1 ring-white/15',
        SIZES[size],
      )}
      style={{ backgroundColor: bg, color: teamTextColor(bg) }}
    >
      {abbr}
    </span>
  )
}
```

`src/components/status-pill.tsx`:
```tsx
import type { DisplayStatus } from '@/lib/game/status'
import { cn } from '@/lib/utils'

const STYLES: Record<DisplayStatus, string> = {
  OPEN: 'bg-primary/15 text-primary',
  CLOSED: 'bg-surface-2 text-muted-foreground',
  LIVE: 'bg-live/15 text-live',
  FINAL: 'bg-surface-2 text-foreground',
  SETTLED: 'bg-surface-2 text-muted-foreground',
  VOID: 'bg-danger/15 text-danger',
  POSTPONED: 'bg-live/15 text-live',
}

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        STYLES[status],
      )}
    >
      {status === 'LIVE' && <span aria-hidden className="bg-live size-1.5 animate-pulse rounded-full" />}
      {status}
    </span>
  )
}
```

`src/components/points-amount.tsx`:
```tsx
import { formatPoints, formatSignedPoints } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  value: number
  /** Show a leading + for positive values and color by sign (accent / danger). */
  signed?: boolean
  /** Append " pts". */
  unit?: boolean
  className?: string
}

export function PointsAmount({ value, signed = false, unit = false, className }: Props) {
  const tone = signed ? (value > 0 ? 'text-primary' : value < 0 ? 'text-danger' : '') : ''
  return (
    <span className={cn('num', tone, className)}>
      {signed ? formatSignedPoints(value) : formatPoints(value)}
      {unit && ' pts'}
    </span>
  )
}
```

`src/components/countdown.tsx` — replace:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { formatCountdown } from '@/lib/format'

/** Live countdown to tip-off; calls router.refresh() once when it reaches 0 (spec §3.4). */
export function Countdown({ to }: { to: string }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const ms = new Date(to).getTime() - now
  const closed = ms <= 0

  useEffect(() => {
    if (closed) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [closed])

  useEffect(() => {
    if (closed) router.refresh()
  }, [closed, router])

  if (closed) return <span className="text-muted-foreground">Betting closed</span>
  return (
    <span className="num" suppressHydrationWarning>
      {formatCountdown(ms)}
    </span>
  )
}
```

`src/components/action-form.tsx` — replace (shadcn Button, toast on success, optional AlertDialog confirm):
```tsx
'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/action-state'

type Confirm = { title: string; description: string; actionLabel: string }

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children?: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  /** Called after a successful submit (e.g. to close the surrounding Dialog). */
  onSuccess?: () => void
  /** Ask for confirmation in an AlertDialog before submitting. */
  confirm?: Confirm
  destructive?: boolean
}

/** Success shows as a toast; errors stay inline under the fields (spec §3.6). */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  confirm,
  destructive,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  const onSuccessRef = useRef(onSuccess)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (!state.ok) return
    toast.success(state.ok)
    if (resetOnSuccess) ref.current?.reset()
    onSuccessRef.current?.()
  }, [state, resetOnSuccess])

  const variant = destructive ? 'destructive' : 'default'
  return (
    <form ref={ref} action={formAction} className={className ?? 'space-y-3'}>
      {children}
      {confirm ? (
        <Button
          type="button"
          variant={variant}
          disabled={pending}
          onClick={() => {
            if (ref.current?.reportValidity()) setConfirming(true)
          }}
        >
          {pending ? 'Working…' : submitLabel}
        </Button>
      ) : (
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? 'Working…' : submitLabel}
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {confirm && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => ref.current?.requestSubmit()}>
                {confirm.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </form>
  )
}
```

- [ ] **Step 10: Verify and check manually**

Run: `npm run check`
Expected: format, lint, typecheck and all tests pass.

Manual: `npm run dev -- -p 3005`, then open `http://localhost:3005/login` and the existing pages.
- The background is dark (#0b0f14), with Inter text and the accent-green primary button.
- The existing pages are restyled through the legacy classes and are readable.
- Submitting a form that succeeds (e.g. admin Settings → Save) shows a toast at the top.

Stop the server.

- [ ] **Step 11: Commit**

```bash
git add components.json package.json package-lock.json src/app/globals.css src/app/layout.tsx src/lib/utils.ts src/lib/teams.ts src/lib/game/status.ts src/lib/format.ts src/components tests/unit/teams.test.ts tests/unit/status.test.ts tests/unit/format.test.ts
git commit -m "feat: add neon sportsbook design system with shadcn/ui"
```

---

### Task 2: ET date helpers

**Files:**
- Create: `src/lib/dates.ts`
- Test: `tests/unit/dates.test.ts`

**Interfaces:**
- Produces:
  - `ET = 'America/New_York'`, `type StripDay = { date: string; label: string }`;
  - `etDateOf(date: Date): string` (`'YYYY-MM-DD'`), `isEtDate(value: string): boolean`;
  - `addEtDays(etDate: string, days: number): string`;
  - `etDayRange(etDate: string): { start: Date; end: Date }` (UTC, `[start, end)`);
  - `etDateStrip(now: Date): StripDay[]` (8 days: `Yesterday`, `Today`, then `"Fri 13"` style labels);
  - `shortDayLabel(etDate: string): string`;
  - `parseStripDate(raw: unknown, now: Date): string` (a valid strip date, else today).

- [ ] **Step 1: Write the failing test**

`tests/unit/dates.test.ts` (Review Focus #1 and #4: midnight ET, DST days, junk `?date=`):
```ts
import { describe, expect, it } from 'vitest'

import {
  addEtDays,
  etDateOf,
  etDateStrip,
  etDayRange,
  isEtDate,
  parseStripDate,
  shortDayLabel,
} from '@/lib/dates'

describe('ET date helpers', () => {
  it('maps instants to ET calendar dates around midnight ET', () => {
    expect(etDateOf(new Date('2026-11-12T04:59:59Z'))).toBe('2026-11-11') // 23:59:59 EST
    expect(etDateOf(new Date('2026-11-12T05:00:00Z'))).toBe('2026-11-12') // 00:00 EST
    expect(etDateOf(new Date('2026-07-05T03:59:59Z'))).toBe('2026-07-04') // 23:59:59 EDT
    expect(etDateOf(new Date('2026-07-05T04:00:00Z'))).toBe('2026-07-05')
  })

  it('returns UTC ranges for normal and DST days', () => {
    expect(etDayRange('2026-11-11')).toEqual({
      start: new Date('2026-11-11T05:00:00Z'),
      end: new Date('2026-11-12T05:00:00Z'),
    })
    // DST ends 2026-11-01 02:00 EDT: a 25-hour day
    expect(etDayRange('2026-11-01')).toEqual({
      start: new Date('2026-11-01T04:00:00Z'),
      end: new Date('2026-11-02T05:00:00Z'),
    })
    // DST starts 2026-03-08 02:00 EST: a 23-hour day
    expect(etDayRange('2026-03-08')).toEqual({
      start: new Date('2026-03-08T05:00:00Z'),
      end: new Date('2026-03-09T04:00:00Z'),
    })
  })

  it('validates and adds dates', () => {
    expect(isEtDate('2026-02-28')).toBe(true)
    expect(isEtDate('2026-02-30')).toBe(false)
    expect(isEtDate('2026-2-3')).toBe(false)
    expect(isEtDate('yesterday')).toBe(false)
    expect(addEtDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addEtDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(shortDayLabel('2026-11-13')).toBe('Fri 13')
  })

  it('builds the 8-day strip from yesterday in ET', () => {
    const now = new Date('2026-11-12T03:00:00Z') // 22:00 ET on Nov 11
    const strip = etDateStrip(now)
    expect(strip.map((d) => d.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ])
    expect(strip.slice(0, 3).map((d) => d.label)).toEqual(['Yesterday', 'Today', 'Thu 12'])
  })

  it('falls back to Today for invalid or out-of-range ?date=', () => {
    const now = new Date('2026-11-11T17:00:00Z')
    expect(parseStripDate('2026-11-13', now)).toBe('2026-11-13')
    expect(parseStripDate('2026-11-10', now)).toBe('2026-11-10')
    expect(parseStripDate(undefined, now)).toBe('2026-11-11')
    expect(parseStripDate('2026-11-09', now)).toBe('2026-11-11')
    expect(parseStripDate('2026-11-30', now)).toBe('2026-11-11')
    expect(parseStripDate('not-a-date', now)).toBe('2026-11-11')
    expect(parseStripDate(['2026-11-13'], now)).toBe('2026-11-11')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/dates.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dates'`.

- [ ] **Step 3: Implement `src/lib/dates.ts`**

US DST switches at 02:00 local time, so ET midnight is never ambiguous. A second pass of the offset lookup settles the offset near a switch.
```ts
/** US Eastern ("ET") calendar dates as 'YYYY-MM-DD' strings. DST-safe. */
export const ET = 'America/New_York'

const DAY_MS = 86_400_000
const ET_DATE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

export type StripDay = { date: string; label: string }

/** The ET calendar date of an instant. */
export function etDateOf(date: Date): string {
  return dateFormatter.format(date)
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isEtDate(value: string): boolean {
  if (!ET_DATE.test(value)) return false
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function addEtDays(etDate: string, days: number): string {
  return new Date(Date.parse(`${etDate}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Milliseconds ET is ahead of UTC at `at` (negative: -4h in EDT, -5h in EST). */
function etOffsetMs(at: Date): number {
  const parts = partsFormatter.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The UTC instant of 00:00 ET on `etDate`. US DST switches at 02:00, so midnight is never ambiguous. */
function etMidnightUtc(etDate: string): Date {
  const utcMidnight = Date.parse(`${etDate}T00:00:00Z`)
  let t = utcMidnight - etOffsetMs(new Date(utcMidnight))
  t = utcMidnight - etOffsetMs(new Date(t)) // second pass settles the offset near a DST switch
  return new Date(t)
}

/** [start, end) in UTC of an ET calendar day (23 or 25 hours long on DST days). */
export function etDayRange(etDate: string): { start: Date; end: Date } {
  return { start: etMidnightUtc(etDate), end: etMidnightUtc(addEtDays(etDate, 1)) }
}

/** Yesterday, Today and the next 6 days (spec §4.1). */
export function etDateStrip(now: Date): StripDay[] {
  const today = etDateOf(now)
  return Array.from({ length: 8 }, (_, i) => {
    const date = addEtDays(today, i - 1)
    return { date, label: i === 0 ? 'Yesterday' : i === 1 ? 'Today' : shortDayLabel(date) }
  })
}

/** "Fri 13" */
export function shortDayLabel(etDate: string): string {
  const d = new Date(`${etDate}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${d.getUTCDate()}`
}

/** A `?date=` value if it is a valid date inside the strip, otherwise Today. */
export function parseStripDate(raw: unknown, now: Date): string {
  const today = etDateOf(now)
  if (typeof raw !== 'string' || !isEtDate(raw)) return today
  return etDateStrip(now).some((d) => d.date === raw) ? raw : today
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/dates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

Run `npm run check`, then:
```bash
git add src/lib/dates.ts tests/unit/dates.test.ts
git commit -m "feat: add US Eastern date helpers"
```

---

### Task 3: `estimatePayout` and `getEndingStakes`

**Files:**
- Modify: `src/lib/game/payout.ts`
- Create: `src/server/queries/stakes.ts`
- Test: `tests/unit/payout.test.ts` (extend), `tests/integration/stakes.test.ts`

**Interfaces:**
- Consumes: `computeSplit` and `PAYOUT_PERCENT` (existing), and `placeBet` (existing; used in tests).
- Produces:
  - `estimatePayout(pool: number, endingStake: number, stake: number): number`;
  - `type EndingStakes = { pool: number; cells: number[][] }` (`cells[awayDigit][homeDigit]`, always 10×10);
  - `getEndingStakes(gameId: string): Promise<EndingStakes>`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/payout.test.ts`, change the import to `import { computeSplit, estimatePayout } from '@/lib/game/payout'` and append:
```ts

describe('estimatePayout', () => {
  // The estimate must equal what settlement would pay if the game ended now on this ending.
  function settledPayout(pool: number, endingStake: number, stake: number): number {
    const bets = [
      { id: 'others-on-ending', stake: endingStake, isWinner: true },
      { id: 'rest-of-pool', stake: pool - endingStake, isWinner: false },
      { id: 'me', stake, isWinner: true },
    ].filter((b) => b.stake > 0)
    return computeSplit(bets).payouts.get('me') ?? 0
  }

  it.each([
    [0, 0, 100], // empty pool: you get 90% of your own stake
    [1000, 0, 100], // nobody else on the ending
    [1000, 300, 100],
    [1000, 1000, 100], // everyone on your ending
    [5, 2, 1], // tiny numbers, flooring
    [1200, 0, 1],
    [123_457, 4_321, 999],
    [1_000_000_000, 250_000_000, 1_000_000_000], // large values stay exact
  ])('pool=%i endingStake=%i stake=%i matches computeSplit', (pool, endingStake, stake) => {
    expect(estimatePayout(pool, endingStake, stake)).toBe(settledPayout(pool, endingStake, stake))
  })

  it('matches computeSplit across a grid of small values', () => {
    for (let pool = 0; pool <= 60; pool += 7) {
      for (let endingStake = 0; endingStake <= pool; endingStake += 5) {
        for (const stake of [1, 2, 3, 10, 50]) {
          expect(estimatePayout(pool, endingStake, stake)).toBe(settledPayout(pool, endingStake, stake))
        }
      }
    }
  })

  it('is the documented formula', () => {
    // floor(floor((1000 + 100) * 90 / 100) * 100 / (300 + 100)) = floor(990 * 100 / 400) = 247
    expect(estimatePayout(1000, 300, 100)).toBe(247)
  })

  it('returns 0 for a non-positive or fractional stake', () => {
    expect(estimatePayout(1000, 0, 0)).toBe(0)
    expect(estimatePayout(1000, 0, -5)).toBe(0)
    expect(estimatePayout(1000, 0, 1.5)).toBe(0)
  })
})
```

`tests/integration/stakes.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { getEndingStakes } from '@/server/queries/stakes'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('getEndingStakes', () => {
  beforeEach(resetDb)

  it('returns an all-zero 10x10 grid for a game without bets', async () => {
    const g = await makeGame()
    const s = await getEndingStakes(g.id)
    expect(s.pool).toBe(0)
    expect(s.cells).toHaveLength(10)
    for (const row of s.cells) expect(row).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('sums stakes per ending across players and excludes REFUNDED bets', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await fundUser(a.id, 1000)
    await fundUser(b.id, 1000)
    const g = await makeGame()
    await placeBet(a.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await placeBet(b.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 50 })
    await placeBet(b.id, { gameId: g.id, awayDigit: 0, homeDigit: 9, stake: 30 })
    const refunded = await placeBet(a.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 70 })
    await prisma.bet.update({ where: { id: refunded.id }, data: { result: 'REFUNDED' } })

    const s = await getEndingStakes(g.id)
    expect(s.cells[9]?.[6]).toBe(150)
    expect(s.cells[0]?.[9]).toBe(30)
    expect(s.cells[1]?.[1]).toBe(0)
    expect(s.pool).toBe(180)
    expect(JSON.stringify(s)).not.toContain(a.username)
  })

  it('only counts the requested game', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g1 = await makeGame()
    const g2 = await makeGame()
    await placeBet(u.id, { gameId: g2.id, awayDigit: 2, homeDigit: 2, stake: 40 })
    expect((await getEndingStakes(g1.id)).pool).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/payout.test.ts tests/integration/stakes.test.ts`
Expected: FAIL — `estimatePayout is not a function` and `Cannot find module '@/server/queries/stakes'`.

- [ ] **Step 3: Implement**

Append to `src/lib/game/payout.ts`:
```ts

/**
 * Payout for a new bet of `stake` on an ending that already has `endingStake`, in a pool of
 * `pool`, assuming no further bets. Equals computeSplit's payout for that bet (spec §6.3).
 */
export function estimatePayout(pool: number, endingStake: number, stake: number): number {
  if (!Number.isInteger(stake) || stake <= 0) return 0
  const payoutPool = (BigInt(pool + stake) * BigInt(PAYOUT_PERCENT)) / BigInt(100)
  return Number((payoutPool * BigInt(stake)) / BigInt(endingStake + stake))
}
```

`src/server/queries/stakes.ts`:
```ts
import { prisma } from '@/lib/db'

export type EndingStakes = {
  /** Sum of all non-refunded stakes. */
  pool: number
  /** cells[awayDigit][homeDigit] = total stake on that ending. Totals only, never usernames. */
  cells: number[][]
}

function emptyCells(): number[][] {
  return Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0))
}

export async function getEndingStakes(gameId: string): Promise<EndingStakes> {
  const groups = await prisma.bet.groupBy({
    by: ['awayDigit', 'homeDigit'],
    where: { gameId, result: { not: 'REFUNDED' } },
    _sum: { stake: true },
  })
  const cells = emptyCells()
  let pool = 0
  for (const g of groups) {
    const row = cells[g.awayDigit]
    const stake = g._sum.stake ?? 0
    if (!row || g.homeDigit < 0 || g.homeDigit > 9) continue
    row[g.homeDigit] = stake
    pool += stake
  }
  return { pool, cells }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/unit/payout.test.ts tests/integration/stakes.test.ts`
Expected: PASS (5 existing + 11 new unit tests, 3 integration tests).

- [ ] **Step 5: Commit**

Run `npm run check`, then:
```bash
git add src/lib/game/payout.ts src/server/queries/stakes.ts tests/unit/payout.test.ts tests/integration/stakes.test.ts
git commit -m "feat: add payout estimate and per-ending stake totals"
```

---

### Task 4: `placeBets` — an all-or-nothing slip

**Files:**
- Create: `src/lib/game/limits.ts`
- Modify: `src/lib/errors.ts`, `src/lib/action-state.ts`, `src/server/bets.ts`
- Test: `tests/integration/place-bets.test.ts` (new), `tests/unit/action-state.test.ts` (extend). The existing `tests/integration/bets.test.ts` must stay green unchanged.

**Interfaces:**
- Consumes: `postEntry` (ledger), `formatEnding` (`src/lib/game/ending.ts`), `isSuspended`, `intFromForm`.
- Produces:
  - `MAX_SLIP_PICKS = 20`, `MAX_STAKE = 1_000_000_000` (`src/lib/game/limits.ts`);
  - `new DomainError(code, message, pickIndex?: number)` with a readonly `pickIndex?: number`;
  - `type ActionState = { error?: string; ok?: string; pickIndex?: number }`, where `runAction` copies `pickIndex` from a `DomainError`;
  - `placeBetsSchema` and `placeBets(userId: string, input: unknown, now?: Date): Promise<Bet[]>`. It throws `ZodError` for a bad slip and `DomainError` with `pickIndex` for a failing pick, prefixed `"AWAY @ HOME a-h: "` when the slip has more than one pick (`"Pick N: "` for an unknown game);
  - `placeBet(userId, input, now?)` is unchanged for callers and returns one `Bet`.

- [ ] **Step 1: Write the failing tests**

`tests/integration/place-bets.test.ts` (Review Focus #2 is the two concurrency tests at the end):
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { placeBet, placeBets } from '@/server/bets'

import { expectLedgerConsistent, fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

async function balanceOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).balance
}
async function poolOf(id: string) {
  return (await prisma.game.findUniqueOrThrow({ where: { id } })).pool
}

describe('placeBets', () => {
  beforeEach(resetDb)

  it('places every pick, merging same-ending picks, in one go', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g1 = await makeGame()
    const g2 = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK' })
    const bets = await placeBets(u.id, [
      { gameId: g1.id, awayDigit: 9, homeDigit: 6, stake: 100 },
      { gameId: g2.id, awayDigit: 0, homeDigit: 0, stake: 50 },
      { gameId: g1.id, awayDigit: 9, homeDigit: 6, stake: 25 },
    ])
    expect(bets).toHaveLength(3)
    expect(await balanceOf(u.id)).toBe(825)
    expect(await poolOf(g1.id)).toBe(125)
    expect(await poolOf(g2.id)).toBe(50)
    expect(await prisma.bet.count()).toBe(2)
    expect(
      (await prisma.bet.findFirstOrThrow({ where: { gameId: g1.id, awayDigit: 9, homeDigit: 6 } })).stake,
    ).toBe(125)
    expect(await prisma.transaction.count({ where: { type: 'BET' } })).toBe(3)
    await expectLedgerConsistent()
  })

  it('rolls everything back when one pick is closed, naming the pick', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const open = await makeGame()
    const closed = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK', status: 'LIVE' })
    const err = await placeBets(u.id, [
      { gameId: open.id, awayDigit: 1, homeDigit: 2, stake: 100 },
      { gameId: closed.id, awayDigit: 9, homeDigit: 6, stake: 100 },
    ]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({
      code: 'BETTING_CLOSED',
      message: 'BOS @ NYK 9-6: Betting closed',
      pickIndex: 1,
    })
    expect(await balanceOf(u.id)).toBe(1000)
    expect(await poolOf(open.id)).toBe(0)
    expect(await prisma.bet.count()).toBe(0)
    await expectLedgerConsistent()
  })

  it('rejects a slip whose total exceeds the balance, flagging the pick that ran out', async () => {
    const u = await makeUser()
    await fundUser(u.id, 150)
    const g = await makeGame()
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      ]),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'LAL @ GSW 2-2: Insufficient balance',
      pickIndex: 1,
    })
    expect(await balanceOf(u.id)).toBe(150)
    expect(await poolOf(g.id)).toBe(0)
    expect(await prisma.bet.count()).toBe(0)
  })

  it('counts earlier slip picks and existing bets toward the per-game stake limit', async () => {
    const u = await makeUser({ stakeLimitPerGame: 100 })
    await fundUser(u.id, 1000)
    const g = await makeGame()
    const other = await makeGame()
    await placeBet(u.id, { gameId: g.id, awayDigit: 0, homeDigit: 0, stake: 30 })
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 40 },
        { gameId: other.id, awayDigit: 1, homeDigit: 1, stake: 100 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 40 },
      ]),
    ).rejects.toMatchObject({
      code: 'STAKE_LIMIT',
      message: 'LAL @ GSW 2-2: Stake limit exceeded (remaining: 30)',
      pickIndex: 2,
    })
    expect(await prisma.bet.count()).toBe(1)
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 40 },
        { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 30 },
      ]),
    ).resolves.toHaveLength(2)
  })

  it('names an unknown game by its position', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame()
    await expect(
      placeBets(u.id, [
        { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 },
        { gameId: 'missing', awayDigit: 1, homeDigit: 1, stake: 10 },
      ]),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Pick 2: Game not found', pickIndex: 1 })
  })

  it('keeps single-pick errors unprefixed', async () => {
    const u = await makeUser()
    await fundUser(u.id, 1000)
    const g = await makeGame({ status: 'FINAL' })
    await expect(
      placeBets(u.id, [{ gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 10 }]),
    ).rejects.toMatchObject({ code: 'BETTING_CLOSED', message: 'Betting closed', pickIndex: 0 })
  })

  it.each([
    [[]],
    [Array.from({ length: 21 }, () => ({ gameId: 'g', awayDigit: 1, homeDigit: 1, stake: 1 }))],
    ['nope'],
  ])('rejects an empty, oversized or malformed slip (%#)', async (input) => {
    const u = await makeUser()
    await expect(placeBets(u.id, input)).rejects.toBeInstanceOf(ZodError)
  })

  it('concurrent overlapping slips neither deadlock nor overspend', async () => {
    const u = await makeUser()
    await fundUser(u.id, 300)
    const g1 = await makeGame()
    const g2 = await makeGame()
    const slipA = [
      { gameId: g1.id, awayDigit: 1, homeDigit: 1, stake: 100 },
      { gameId: g2.id, awayDigit: 1, homeDigit: 1, stake: 100 },
    ]
    const slipB = [
      { gameId: g2.id, awayDigit: 2, homeDigit: 2, stake: 100 },
      { gameId: g1.id, awayDigit: 2, homeDigit: 2, stake: 100 },
    ]
    const results = await Promise.allSettled([placeBets(u.id, slipA), placeBets(u.id, slipB)])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.status === 'rejected' && failed[0].reason).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    })
    expect(await balanceOf(u.id)).toBe(100)
    expect((await poolOf(g1.id)) + (await poolOf(g2.id))).toBe(200)
    await expectLedgerConsistent()
  })

  it('many concurrent slips from different players on shared games all succeed', async () => {
    const users = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()])
    for (const u of users) await fundUser(u.id, 1000)
    const games = await Promise.all([makeGame(), makeGame(), makeGame()])
    const ids = games.map((g) => g.id)
    await Promise.all(
      users.map((u, i) =>
        placeBets(
          u.id,
          (i % 2 === 0 ? ids : [...ids].reverse()).map((gameId) => ({
            gameId,
            awayDigit: i,
            homeDigit: i,
            stake: 10,
          })),
        ),
      ),
    )
    for (const g of games) expect(await poolOf(g.id)).toBe(40)
    await expectLedgerConsistent()
  })
})
```

Append to `tests/unit/action-state.test.ts`, inside the `describe('runAction', …)` block after the "maps DomainError" test:
```ts
  it('passes a pick index through', async () => {
    expect(
      await runAction(async () => {
        throw new DomainError('BETTING_CLOSED', 'LAL @ GSW 9-6: Betting closed', 1)
      }),
    ).toEqual({ error: 'LAL @ GSW 9-6: Betting closed', pickIndex: 1 })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/integration/place-bets.test.ts tests/unit/action-state.test.ts`
Expected: FAIL — `placeBets` is not exported from `@/server/bets`, and the pick-index test gets `{ error: … }` without `pickIndex`.

- [ ] **Step 3: Implement**

`src/lib/game/limits.ts`:
```ts
/** Most picks a bet slip may hold (spec §4.3, §6.1). */
export const MAX_SLIP_PICKS = 20
/** Largest single stake accepted. */
export const MAX_STAKE = 1_000_000_000
```

`src/lib/errors.ts` — replace:
```ts
export type DomainErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'BETTING_CLOSED'
  | 'STAKE_LIMIT'
  | 'SUSPENDED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'INVALID_REFERRAL'
  | 'CONFLICT'

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    /** For bet-slip errors: index of the failing pick in the submitted slip. */
    public readonly pickIndex?: number,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
```

`src/lib/action-state.ts` — replace:
```ts
import { ZodError } from 'zod'

import { DomainError } from './errors'

export type ActionState = { error?: string; ok?: string; pickIndex?: number }

export async function runAction<T>(
  fn: () => Promise<T>,
  ok?: string | ((result: T) => string),
): Promise<ActionState> {
  try {
    const result = await fn()
    return { ok: typeof ok === 'function' ? ok(result) : (ok ?? 'Done') }
  } catch (e) {
    if (e instanceof DomainError) {
      return e.pickIndex === undefined ? { error: e.message } : { error: e.message, pickIndex: e.pickIndex }
    }
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? 'Invalid input' }
    throw e
  }
}
```

`src/server/bets.ts` — replace the whole file.
- Games are locked one by one in ascending id order (JS `.sort()` on the ids; the same order in every slip), and only then is the user row touched (by `postEntry`).
- Settlement and void also lock a game before users, so the lock order is games → user everywhere.
- The stake limit counts the existing bets on each game plus this slip's earlier picks on that game.
```ts
import { type Bet, type GameStatus } from '@prisma/client'
import { z } from 'zod'

import { prisma, type Tx } from '@/lib/db'
import { DomainError } from '@/lib/errors'
import { formatEnding } from '@/lib/game/ending'
import { MAX_SLIP_PICKS, MAX_STAKE } from '@/lib/game/limits'
import { isSuspended } from '@/lib/suspension'
import { intFromForm } from '@/lib/validation'

import { postEntry } from './ledger'

export const placeBetSchema = z.object({
  gameId: z.string().min(1, 'Game is required'),
  awayDigit: intFromForm('Away digit', 0, 9),
  homeDigit: intFromForm('Home digit', 0, 9),
  stake: intFromForm('Stake', 1, MAX_STAKE),
})

export const placeBetsSchema = z
  .array(placeBetSchema)
  .min(1, 'Add at least one pick')
  .max(MAX_SLIP_PICKS, `A slip holds at most ${MAX_SLIP_PICKS} picks`)

type Pick = z.infer<typeof placeBetSchema>
type LockedGame = { id: string; status: GameStatus; startsAt: Date; awayTeam: string; homeTeam: string }

/** Locks each distinct game FOR UPDATE in ascending id order (deadlock-free across slips). */
async function lockGames(tx: Tx, gameIds: string[]): Promise<Map<string, LockedGame>> {
  const locked = new Map<string, LockedGame>()
  for (const id of [...new Set(gameIds)].sort()) {
    const rows = await tx.$queryRaw<LockedGame[]>`
      SELECT id, status, "startsAt", "awayTeam", "homeTeam" FROM "Game" WHERE id = ${id} FOR UPDATE`
    const game = rows[0]
    if (game) locked.set(id, game)
  }
  return locked
}

/**
 * Places every pick or none (spec §6.1). One transaction: games are locked in ascending id
 * order, then each pick is checked and written. A failing pick throws a DomainError carrying
 * `pickIndex`; with more than one pick its message is prefixed with the pick label
 * (`LAL @ GSW 9-6: Betting closed`).
 */
export async function placeBets(userId: string, input: unknown, now: Date = new Date()): Promise<Bet[]> {
  const picks = placeBetsSchema.parse(input)
  const single = picks.length === 1

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (isSuspended(user, now)) throw new DomainError('SUSPENDED', 'Account suspended')

    const games = await lockGames(
      tx,
      picks.map((p) => p.gameId),
    )
    const fail = (index: number, pick: Pick, e: DomainError): DomainError => {
      const game = games.get(pick.gameId)
      const label = game ? `${game.awayTeam} @ ${game.homeTeam} ${formatEnding(pick)}` : `Pick ${index + 1}`
      return new DomainError(e.code, single ? e.message : `${label}: ${e.message}`, index)
    }

    // Stake already on each game (before this slip), for the per-game limit.
    const existing = new Map<string, number>()
    if (user.stakeLimitPerGame !== null) {
      const sums = await tx.bet.groupBy({
        by: ['gameId'],
        where: { userId, gameId: { in: [...games.keys()] } },
        _sum: { stake: true },
      })
      for (const s of sums) existing.set(s.gameId, s._sum.stake ?? 0)
    }

    const bets: Bet[] = []
    for (const [index, pick] of picks.entries()) {
      const game = games.get(pick.gameId)
      if (!game) throw fail(index, pick, new DomainError('NOT_FOUND', 'Game not found'))
      if (game.status !== 'SCHEDULED' || now >= game.startsAt) {
        throw fail(index, pick, new DomainError('BETTING_CLOSED', 'Betting closed'))
      }

      if (user.stakeLimitPerGame !== null) {
        const already = existing.get(pick.gameId) ?? 0
        if (already + pick.stake > user.stakeLimitPerGame) {
          const remaining = Math.max(0, user.stakeLimitPerGame - already)
          throw fail(
            index,
            pick,
            new DomainError('STAKE_LIMIT', `Stake limit exceeded (remaining: ${remaining})`),
          )
        }
        existing.set(pick.gameId, already + pick.stake)
      }

      const { gameId, awayDigit, homeDigit, stake } = pick
      const bet = await tx.bet.upsert({
        where: { userId_gameId_awayDigit_homeDigit: { userId, gameId, awayDigit, homeDigit } },
        create: { userId, gameId, awayDigit, homeDigit, stake },
        update: { stake: { increment: stake } },
      })
      try {
        await postEntry(
          tx,
          { userId, type: 'BET', amount: -stake, gameId, betId: bet.id },
          { requireFunds: true },
        )
      } catch (e) {
        throw e instanceof DomainError ? fail(index, pick, e) : e
      }
      await tx.game.update({ where: { id: gameId }, data: { pool: { increment: stake } } })
      bets.push(bet)
    }
    return bets
  })
}

/** Single-pick wrapper kept for existing callers and tests. */
export async function placeBet(userId: string, input: unknown, now: Date = new Date()): Promise<Bet> {
  const [bet] = await placeBets(userId, [input], now)
  if (!bet) throw new Error('placeBets returned no bet for one pick')
  return bet
}
```

- [ ] **Step 4: Run them to verify they pass, plus the old tests**

Run: `npx vitest run tests/integration/place-bets.test.ts tests/integration/bets.test.ts tests/integration/settlement.test.ts tests/integration/sync.test.ts tests/unit/action-state.test.ts`
Expected: PASS. The `placeBet` tests are unchanged: single-pick messages carry no prefix (`'Stake limit exceeded (remaining: 40)'`), and junk input still throws `ZodError`.

- [ ] **Step 5: Commit**

Run `npm run check`, then:
```bash
git add src/lib/game/limits.ts src/lib/errors.ts src/lib/action-state.ts src/server/bets.ts tests/integration/place-bets.test.ts tests/unit/action-state.test.ts
git commit -m "feat: place a whole bet slip in one transaction"
```

---

### Task 5: Player queries — feed, grouped bets, wallet, slip status

**Files:**
- Create: `src/lib/pagination.ts`, `src/lib/game/sections.ts`, `src/lib/my-bets.ts`, `src/lib/wallet.ts`
- Modify: `src/server/queries/player.ts`, `src/app/(player)/wallet/page.tsx` (call-site only)
- Test: `tests/unit/sections.test.ts`, `tests/integration/player-feed.test.ts`

**Interfaces:**
- Consumes: `etDayRange` (Task 2), `isBettingOpen` (Task 1), `MAX_SLIP_PICKS` (Task 4), `formatEnding`.
- Produces (`src/lib`):
  - `type Page<T> = { rows: T[]; total: number; page: number; pageCount: number }`;
  - `firstParam(raw: unknown): string | undefined`, `parsePage(raw: unknown): number`;
  - `pageWindow(total, page, size): { page, pageCount, skip, take }`;
  - `type SectionKey = 'live'|'open'|'closed'|'final'`, `sectionOf(game, now)`;
  - `groupIntoSections<G>(games: G[], now): { key; title; games: G[] }[]`, with titles `Live`, `Open for bets`, `Upcoming / closed`, `Final`;
  - `BET_TABS = ['open','settled','refunded']`, `type BetTab`, `BET_TAB_LABELS`, `BET_TAB_RESULTS`, `parseBetTab(raw)`;
  - `WALLET_FILTERS = ['all','bets','payouts','bonuses','admin','refunds']`, `type WalletFilter`, `WALLET_FILTER_LABELS`, `WALLET_FILTER_TYPES`, `TX_TYPE_LABELS` (e.g. `PAYOUT: 'Payout'`), `parseWalletFilter(raw)`.
- Produces (`src/server/queries/player.ts`):
  - `listGamesForDate(etDate, userId): Promise<(Game & { myPickCount: number })[]>`;
  - `listMyBetsGrouped(userId, tab: BetTab, page): Promise<Page<{ game: Game; bets: Bet[] }>>` (20 games per page);
  - `listMyTransactions(userId, filter: WalletFilter, page)` → `{ rows: (Transaction & { game: { awayTeam; homeTeam } | null })[], total, page, pageCount }` (50 per page; **the signature changes**);
  - `getSlipStatus(userId, picks: unknown, now?) → Promise<SlipStatus>`, where `SlipStatus = { balance: number; picks: PickStatus[] }` and `PickStatus = { gameId; awayDigit; homeDigit; matchup: string; open: boolean; pool: number; endingStake: number }`.
  - `getGameForPlayer` and `listMyReferrals` are unchanged. `listUpcomingGames` and `listMyBets` stay until Tasks 9 and 10 delete them.

- [ ] **Step 1: Write the failing tests**

`tests/unit/sections.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { groupIntoSections, sectionOf } from '@/lib/game/sections'
import { parseBetTab } from '@/lib/my-bets'
import { pageWindow, parsePage } from '@/lib/pagination'
import { parseWalletFilter } from '@/lib/wallet'

const now = new Date('2026-11-11T20:00:00Z')
const later = new Date('2026-11-12T00:00:00Z')
const earlier = new Date('2026-11-11T19:00:00Z')

describe('feed sections', () => {
  it('assigns each status to its section', () => {
    expect(sectionOf({ status: 'LIVE', startsAt: earlier }, now)).toBe('live')
    expect(sectionOf({ status: 'SCHEDULED', startsAt: later }, now)).toBe('open')
    expect(sectionOf({ status: 'SCHEDULED', startsAt: earlier }, now)).toBe('closed')
    expect(sectionOf({ status: 'POSTPONED', startsAt: later }, now)).toBe('closed')
    for (const status of ['FINAL', 'SETTLED', 'VOID'] as const) {
      expect(sectionOf({ status, startsAt: earlier }, now)).toBe('final')
    }
  })

  it('orders sections Live, Open, Upcoming/closed, Final and drops empty ones', () => {
    const games = [
      { id: 'f', status: 'FINAL' as const, startsAt: earlier },
      { id: 'o', status: 'SCHEDULED' as const, startsAt: later },
      { id: 'l', status: 'LIVE' as const, startsAt: earlier },
    ]
    expect(groupIntoSections(games, now).map((s) => [s.title, s.games.map((g) => g.id)])).toEqual([
      ['Live', ['l']],
      ['Open for bets', ['o']],
      ['Final', ['f']],
    ])
    expect(groupIntoSections([], now)).toEqual([])
  })
})

describe('param parsing', () => {
  it('parses pages and clamps windows', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage(['2', '9'])).toBe(2)
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '9999999']) expect(parsePage(bad)).toBe(1)
    expect(pageWindow(45, 2, 20)).toEqual({ page: 2, pageCount: 3, skip: 20, take: 20 })
    expect(pageWindow(45, 99, 20)).toEqual({ page: 3, pageCount: 3, skip: 40, take: 20 })
    expect(pageWindow(0, 1, 20)).toEqual({ page: 1, pageCount: 1, skip: 0, take: 20 })
  })

  it('falls back to defaults for unknown tabs and filters', () => {
    expect(parseBetTab('settled')).toBe('settled')
    expect(parseBetTab('WON')).toBe('open')
    expect(parseBetTab(undefined)).toBe('open')
    expect(parseWalletFilter('payouts')).toBe('payouts')
    expect(parseWalletFilter(['bets'])).toBe('all')
    expect(parseWalletFilter('PAYOUT')).toBe('all')
  })
})
```

`tests/integration/player-feed.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import { placeBet } from '@/server/bets'
import { postEntry } from '@/server/ledger'
import {
  getSlipStatus,
  listGamesForDate,
  listMyBetsGrouped,
  listMyTransactions,
} from '@/server/queries/player'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('player feed queries', () => {
  beforeEach(resetDb)

  it('lists the games of one ET day with the viewer pick count', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(me.id, 1000)
    await fundUser(other.id, 1000)
    // ET day 2026-11-11 = [05:00Z Nov 11, 05:00Z Nov 12)
    const late = await makeGame({ startsAt: new Date('2026-11-12T03:30:00Z') }) // 22:30 ET Nov 11
    const early = await makeGame({ startsAt: new Date('2026-11-11T05:00:00Z') }) // 00:00 ET Nov 11
    await makeGame({ startsAt: new Date('2026-11-12T05:00:00Z') }) // Nov 12 ET
    await makeGame({ startsAt: new Date('2026-11-11T04:59:59Z') }) // Nov 10 ET
    const now = new Date('2026-11-10T12:00:00Z')
    await placeBet(me.id, { gameId: late.id, awayDigit: 1, homeDigit: 1, stake: 10 }, now)
    await placeBet(me.id, { gameId: late.id, awayDigit: 2, homeDigit: 2, stake: 10 }, now)
    await placeBet(other.id, { gameId: early.id, awayDigit: 1, homeDigit: 1, stake: 10 }, now)

    const games = await listGamesForDate('2026-11-11', me.id)
    expect(games.map((g) => [g.id, g.myPickCount])).toEqual([
      [early.id, 0],
      [late.id, 2],
    ])
    expect(await listGamesForDate('2026-12-25', me.id)).toEqual([])
  })

  it('groups my bets by game per tab and paginates by game', async () => {
    const me = await makeUser()
    await fundUser(me.id, 10_000)
    const now = new Date('2026-11-10T00:00:00Z')
    const games = []
    for (let i = 0; i < 22; i++) {
      games.push(await makeGame({ startsAt: new Date(Date.UTC(2026, 10, 11, i)) }))
    }
    for (const g of games) {
      await placeBet(me.id, { gameId: g.id, awayDigit: 1, homeDigit: 1, stake: 1 }, now)
      await placeBet(me.id, { gameId: g.id, awayDigit: 2, homeDigit: 2, stake: 1 }, now)
    }
    const settled = games[0]
    if (!settled) throw new Error('setup')
    await prisma.bet.updateMany({ where: { gameId: settled.id, awayDigit: 1 }, data: { result: 'WON' } })
    await prisma.bet.updateMany({ where: { gameId: settled.id, awayDigit: 2 }, data: { result: 'LOST' } })

    const open1 = await listMyBetsGrouped(me.id, 'open', 1)
    expect(open1).toMatchObject({ total: 21, page: 1, pageCount: 2 })
    expect(open1.rows).toHaveLength(20)
    expect(open1.rows[0]?.game.id).toBe(games[21]?.id) // latest tip-off first
    expect(open1.rows[0]?.bets.map((b) => b.awayDigit)).toEqual([1, 2])
    const open2 = await listMyBetsGrouped(me.id, 'open', 2)
    expect(open2.rows.map((r) => r.game.id)).toEqual([games[1]?.id])
    expect((await listMyBetsGrouped(me.id, 'open', 99)).page).toBe(2) // out of range clamps

    const settledTab = await listMyBetsGrouped(me.id, 'settled', 1)
    expect(settledTab.rows.map((r) => [r.game.id, r.bets.map((b) => b.result)])).toEqual([
      [settled.id, ['WON', 'LOST']],
    ])
    expect((await listMyBetsGrouped(me.id, 'refunded', 1)).rows).toEqual([])
  })

  it('filters and paginates my transactions', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(other.id, 5)
    for (let i = 0; i < 55; i++) {
      await prisma.$transaction((tx) => postEntry(tx, { userId: me.id, type: 'ADMIN_GRANT', amount: 1 }))
    }
    await prisma.$transaction((tx) => postEntry(tx, { userId: me.id, type: 'PAYOUT', amount: 90 }))

    const all = await listMyTransactions(me.id, 'all', 1)
    expect(all).toMatchObject({ total: 56, page: 1, pageCount: 2 })
    expect(all.rows).toHaveLength(50)
    expect(all.rows[0]?.type).toBe('PAYOUT')
    expect((await listMyTransactions(me.id, 'all', 2)).rows).toHaveLength(6)
    expect((await listMyTransactions(me.id, 'payouts', 1)).rows.map((t) => t.amount)).toEqual([90])
    expect((await listMyTransactions(me.id, 'admin', 1)).total).toBe(55)
    expect((await listMyTransactions(me.id, 'bonuses', 1)).total).toBe(0)
  })

  it('reports slip status: open flag, pool, stake on the ending and balance', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await fundUser(me.id, 500)
    await fundUser(other.id, 500)
    const open = await makeGame()
    const live = await makeGame({ awayTeam: 'BOS', homeTeam: 'NYK' })
    await placeBet(other.id, { gameId: open.id, awayDigit: 9, homeDigit: 6, stake: 120 })
    await placeBet(other.id, { gameId: open.id, awayDigit: 0, homeDigit: 0, stake: 80 })
    await prisma.game.update({ where: { id: live.id }, data: { status: 'LIVE' } })

    const s = await getSlipStatus(me.id, [
      { gameId: open.id, awayDigit: 9, homeDigit: 6 },
      { gameId: live.id, awayDigit: 1, homeDigit: 1 },
      { gameId: 'gone', awayDigit: 1, homeDigit: 1 },
    ])
    expect(s.balance).toBe(500)
    expect(s.picks).toEqual([
      {
        gameId: open.id,
        awayDigit: 9,
        homeDigit: 6,
        matchup: 'LAL @ GSW',
        open: true,
        pool: 200,
        endingStake: 120,
      },
      {
        gameId: live.id,
        awayDigit: 1,
        homeDigit: 1,
        matchup: 'BOS @ NYK',
        open: false,
        pool: 0,
        endingStake: 0,
      },
      {
        gameId: 'gone',
        awayDigit: 1,
        homeDigit: 1,
        matchup: 'Unknown game',
        open: false,
        pool: 0,
        endingStake: 0,
      },
    ])
    await expect(
      getSlipStatus(me.id, [{ gameId: open.id, awayDigit: 10, homeDigit: 0 }]),
    ).rejects.toBeInstanceOf(ZodError)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/sections.test.ts tests/integration/player-feed.test.ts`
Expected: FAIL — `Cannot find module '@/lib/game/sections'`, and `listGamesForDate` is not exported.

- [ ] **Step 3: Implement the `src/lib` helpers**

`src/lib/pagination.ts`:
```ts
export type Page<T> = { rows: T[]; total: number; page: number; pageCount: number }

/** Search-param value → first string (Next passes string | string[] | undefined). */
export function firstParam(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return undefined
}

/** `?page=` → a whole number ≥ 1; anything else falls back to 1 (spec §5.2). */
export function parsePage(raw: unknown): number {
  const v = firstParam(raw)?.trim()
  if (!v || !/^\d{1,6}$/.test(v)) return 1
  return Math.max(1, Number(v))
}

/** Clamps `page` into [1, pageCount] and returns the Prisma skip/take for it. */
export function pageWindow(total: number, page: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, page), pageCount)
  return { page: current, pageCount, skip: (current - 1) * size, take: size }
}
```

`src/lib/game/sections.ts`:
```ts
import type { GameStatus } from '@prisma/client'

import { isBettingOpen } from './status'

export type SectionKey = 'live' | 'open' | 'closed' | 'final'

export const SECTION_TITLES: Record<SectionKey, string> = {
  live: 'Live',
  open: 'Open for bets',
  closed: 'Upcoming / closed',
  final: 'Final',
}

const ORDER: SectionKey[] = ['live', 'open', 'closed', 'final']

export function sectionOf(game: { status: GameStatus; startsAt: Date }, now: Date): SectionKey {
  switch (game.status) {
    case 'LIVE':
      return 'live'
    case 'SCHEDULED':
      return isBettingOpen(game, now) ? 'open' : 'closed'
    case 'POSTPONED':
      return 'closed'
    case 'FINAL':
    case 'SETTLED':
    case 'VOID':
      return 'final'
  }
}

/** Games grouped into the feed's sections, in feed order; empty sections are dropped (spec §4.1). */
export function groupIntoSections<G extends { status: GameStatus; startsAt: Date }>(
  games: G[],
  now: Date,
): { key: SectionKey; title: string; games: G[] }[] {
  return ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    games: games.filter((g) => sectionOf(g, now) === key),
  })).filter((s) => s.games.length > 0)
}
```

`src/lib/my-bets.ts`:
```ts
import type { BetResult } from '@prisma/client'

export const BET_TABS = ['open', 'settled', 'refunded'] as const
export type BetTab = (typeof BET_TABS)[number]

export const BET_TAB_LABELS: Record<BetTab, string> = {
  open: 'Open',
  settled: 'Settled',
  refunded: 'Refunded',
}

export const BET_TAB_RESULTS: Record<BetTab, BetResult[]> = {
  open: ['PENDING'],
  settled: ['WON', 'LOST'],
  refunded: ['REFUNDED'],
}

export function parseBetTab(raw: unknown): BetTab {
  return BET_TABS.find((t) => t === raw) ?? 'open'
}
```

`src/lib/wallet.ts`:
```ts
import type { TransactionType } from '@prisma/client'

export const WALLET_FILTERS = ['all', 'bets', 'payouts', 'bonuses', 'admin', 'refunds'] as const
export type WalletFilter = (typeof WALLET_FILTERS)[number]

export const WALLET_FILTER_LABELS: Record<WalletFilter, string> = {
  all: 'All',
  bets: 'Bets',
  payouts: 'Payouts',
  bonuses: 'Bonuses',
  admin: 'Admin',
  refunds: 'Refunds',
}

/** Transaction types per filter chip; `null` = no type filter (spec §4.5). */
export const WALLET_FILTER_TYPES: Record<WalletFilter, TransactionType[] | null> = {
  all: null,
  bets: ['BET'],
  payouts: ['PAYOUT'],
  bonuses: ['REFERRAL_BONUS'],
  admin: ['ADMIN_GRANT', 'ADMIN_DEDUCT'],
  refunds: ['REFUND'],
}

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  BET: 'Bet',
  PAYOUT: 'Payout',
  REFERRAL_BONUS: 'Referral bonus',
  ADMIN_GRANT: 'Admin grant',
  ADMIN_DEDUCT: 'Admin deduction',
  REFUND: 'Refund',
}

export function parseWalletFilter(raw: unknown): WalletFilter {
  return WALLET_FILTERS.find((f) => f === raw) ?? 'all'
}
```

- [ ] **Step 4: Implement the queries — replace `src/server/queries/player.ts`**

```ts
import type { Bet, BetResult, Game } from '@prisma/client'
import { z } from 'zod'

import { etDayRange } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { formatEnding } from '@/lib/game/ending'
import { MAX_SLIP_PICKS } from '@/lib/game/limits'
import { isBettingOpen } from '@/lib/game/status'
import { BET_TAB_RESULTS, type BetTab } from '@/lib/my-bets'
import { type Page, pageWindow } from '@/lib/pagination'
import { WALLET_FILTER_TYPES, type WalletFilter } from '@/lib/wallet'

export const BET_GROUPS_PER_PAGE = 20
export const TRANSACTIONS_PER_PAGE = 50

export type FeedGame = Game & { myPickCount: number }

/** Games whose tip-off falls on the ET date, soonest first, with the viewer's pick count. */
export async function listGamesForDate(etDate: string, userId: string): Promise<FeedGame[]> {
  const { start, end } = etDayRange(etDate)
  const games = await prisma.game.findMany({
    where: { startsAt: { gte: start, lt: end } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })
  if (games.length === 0) return []
  const counts = await prisma.bet.groupBy({
    by: ['gameId'],
    where: { userId, gameId: { in: games.map((g) => g.id) } },
    _count: { _all: true },
  })
  const byGame = new Map(counts.map((c) => [c.gameId, c._count._all]))
  return games.map((g) => ({ ...g, myPickCount: byGame.get(g.id) ?? 0 }))
}

/** Replaced by listGamesForDate; removed in Task 9 with the old games page. */
export function listUpcomingGames(now: Date = new Date()) {
  return prisma.game.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - 36 * 3600_000) } },
    orderBy: { startsAt: 'asc' },
    take: 100,
  })
}

/** Replaced by listMyBetsGrouped; removed in Task 10 with the old bets page. */
export function listMyBets(userId: string, result?: BetResult) {
  return prisma.bet.findMany({
    where: { userId, ...(result ? { result } : {}) },
    include: { game: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function getGameForPlayer(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return null
  const [myBets, winners] = await Promise.all([
    prisma.bet.findMany({ where: { gameId, userId }, orderBy: [{ awayDigit: 'asc' }, { homeDigit: 'asc' }] }),
    prisma.bet.count({ where: { gameId, result: 'WON' } }),
  ])
  return { game, myBets, winners }
}

export type BetGroup = { game: Game; bets: Bet[] }

/** The viewer's bets for one tab, grouped by game (latest tip-off first), 20 games per page. */
export async function listMyBetsGrouped(userId: string, tab: BetTab, page: number): Promise<Page<BetGroup>> {
  const where = { bets: { some: { userId, result: { in: BET_TAB_RESULTS[tab] } } } }
  const total = await prisma.game.count({ where })
  const w = pageWindow(total, page, BET_GROUPS_PER_PAGE)
  const games = await prisma.game.findMany({
    where,
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    skip: w.skip,
    take: w.take,
    include: {
      bets: {
        where: { userId, result: { in: BET_TAB_RESULTS[tab] } },
        orderBy: [{ awayDigit: 'asc' }, { homeDigit: 'asc' }],
      },
    },
  })
  return {
    rows: games.map(({ bets, ...game }) => ({ game, bets })),
    total,
    page: w.page,
    pageCount: w.pageCount,
  }
}

/** The viewer's ledger, newest first, 50 per page, filtered by wallet chip (spec §4.5). */
export async function listMyTransactions(userId: string, filter: WalletFilter, page: number) {
  const types = WALLET_FILTER_TYPES[filter]
  const where = { userId, ...(types ? { type: { in: types } } : {}) }
  const total = await prisma.transaction.count({ where })
  const w = pageWindow(total, page, TRANSACTIONS_PER_PAGE)
  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: w.skip,
    take: w.take,
    include: { game: { select: { awayTeam: true, homeTeam: true } } },
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}

export function listMyReferrals(userId: string) {
  return prisma.user.findMany({
    where: { referredById: userId },
    select: { username: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

const slipKeysSchema = z
  .array(
    z.object({
      gameId: z.string().min(1).max(64),
      awayDigit: z.number().int().min(0).max(9),
      homeDigit: z.number().int().min(0).max(9),
    }),
  )
  .max(MAX_SLIP_PICKS)

export type PickStatus = {
  gameId: string
  awayDigit: number
  homeDigit: number
  /** "LAL @ GSW", or "Unknown game". */
  matchup: string
  open: boolean
  pool: number
  /** Stake already on this ending (non-refunded), for the estimate. */
  endingStake: number
}

export type SlipStatus = { balance: number; picks: PickStatus[] }

/** Fresh data for the bet slip: balance plus, per pick, whether its game is open, the pool and the ending stake. */
export async function getSlipStatus(
  userId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<SlipStatus> {
  const keys = slipKeysSchema.parse(input)
  const gameIds = [...new Set(keys.map((k) => k.gameId))]
  const [user, games, sums] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } }),
    prisma.game.findMany({ where: { id: { in: gameIds } } }),
    prisma.bet.groupBy({
      by: ['gameId', 'awayDigit', 'homeDigit'],
      where: { gameId: { in: gameIds }, result: { not: 'REFUNDED' } },
      _sum: { stake: true },
    }),
  ])
  const gameById = new Map(games.map((g) => [g.id, g]))
  const stakeBy = new Map(sums.map((s) => [`${s.gameId}:${formatEnding(s)}`, s._sum.stake ?? 0]))
  return {
    balance: user.balance,
    picks: keys.map((k) => {
      const game = gameById.get(k.gameId)
      return {
        ...k,
        matchup: game ? `${game.awayTeam} @ ${game.homeTeam}` : 'Unknown game',
        open: game ? isBettingOpen(game, now) : false,
        pool: game?.pool ?? 0,
        endingStake: stakeBy.get(`${k.gameId}:${formatEnding(k)}`) ?? 0,
      }
    }),
  }
}
```

In `src/app/(player)/wallet/page.tsx`, adapt the call to the new signature. Replace
```tsx
  const txs = await listMyTransactions(user.id)
```
with
```tsx
  const { rows: txs } = await listMyTransactions(user.id, 'all', 1)
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run tests/unit/sections.test.ts tests/integration/player-feed.test.ts tests/integration/player-queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Run `npm run check`, then:
```bash
git add src/lib/pagination.ts src/lib/game/sections.ts src/lib/my-bets.ts src/lib/wallet.ts src/server/queries/player.ts "src/app/(player)/wallet/page.tsx" tests/unit/sections.test.ts tests/integration/player-feed.test.ts
git commit -m "feat: add player feed, grouped bets, wallet and slip status queries"
```

---

### Task 6: Admin queries — overview, paginated tables, ledger index

**Files:**
- Create: `src/lib/table-params.ts`, `src/lib/url.ts`, `src/server/admin/overview.ts`, `src/server/admin/tables/{players,games,ledger,tickets,admin-actions}.ts`, `prisma/migrations/<timestamp>_transaction_type_created_at_index/migration.sql` (generated)
- Modify: `prisma/schema.prisma`, `src/server/audit.ts`, `src/server/admin/queries.ts` (remove the old `listAdminActions`), `src/app/admin/settings/page.tsx` (call-site only)
- Test: `tests/unit/table-params.test.ts`, `tests/integration/admin-overview.test.ts`, `tests/integration/admin-tables.test.ts`

**Interfaces:**
- Consumes: `firstParam`, `parsePage`, `pageWindow`, `Page<T>` (Task 5); `etDateOf`, `etDayRange`, `addEtDays`, `isEtDate` (Task 2); `getLastSyncAt`.
- Produces (`src/lib/table-params.ts`):
  - `TABLE_PAGE_SIZE = 25`, `type SearchParams = Record<string, string | string[] | undefined>`, `type Sort<F> = { field: F; dir: 'asc'|'desc' }`;
  - `parseSort(raw, allowed, fallback)`, `formatSort(sort)` (`'-joined'`), `parseSearch(raw)` (trimmed, ≤100 chars), `parseOption(raw, options)`;
  - `parseEtDateParam(raw)`, `etDateBounds(from?, to?) → { gte?: Date; lt?: Date } | undefined`.
- Produces (`src/lib/url.ts`): `hrefWith(basePath, current: SearchParams, patch: Record<string, string|number|undefined>): string`.
- Produces (`src/server/admin/overview.ts`):
  - `getOverviewStats(now?)` → `{ playerCount, newPlayers7d, openPoolTotal, openPoolCount, houseTake7d, houseTakeAllTime, lastSyncAt, syncStale, postponed: {id,awayTeam,homeTeam,startsAt}[], negativeBalances: {id,username,balance}[], openTickets: {id,subject,username}[], openTicketCount }`;
  - `type DailyPoint = { date; volume; houseTake }`, `getDailyVolume(days, now?) → DailyPoint[]` (oldest first);
  - `getTopBettorsToday(now?) → { userId; username; volume }[]` (top 5);
  - `getAdminBadges() → { openTickets: number; needsAttention: boolean }`.
- Produces (`src/server/admin/tables/*`), each `parseXListParams(sp: SearchParams)` + `listX(params) → Page<XRow>`:
  - players: sorts `username|balance|joined|referrals` (default `-joined`), `status?: 'active'|'suspended'`, `PlayerRow` includes `_count.referrals`;
  - games: sorts `tipoff|pool|houseTake|status` (default `-tipoff`), `status?`, `from?`, `to?`, `q` = team, `GAME_STATUSES`, `GameRow` includes `_count.bets` (WON);
  - ledger: sorts `time|amount` (default `-time`), `q` = username, `type?`, `from?`, `to?`; also returns `totalAmount`. `LEDGER_TYPES`, `LedgerRow` includes `user {id, username}`;
  - tickets: sorts `updated|created` (default `-updated`), `status` (default `'OPEN'`), `q` = subject or username, `TICKET_STATUSES`, `TicketRow` includes `user` and `_count.messages`;
  - admin-actions: `{ page, action? }`, newest first, `AdminActionRow` includes `admin`, `targetUser`, `targetGame`.
- `src/server/audit.ts` exports `ADMIN_ACTION_TYPES` (a readonly tuple); `AdminActionType` is derived from it.

- [ ] **Step 1: Write the failing tests**

`tests/unit/table-params.test.ts` (Review Focus #1: hostile sort fields and junk dates):
```ts
import { describe, expect, it } from 'vitest'

import {
  etDateBounds,
  formatSort,
  parseEtDateParam,
  parseOption,
  parseSearch,
  parseSort,
} from '@/lib/table-params'
import { hrefWith } from '@/lib/url'

const FIELDS = ['username', 'balance', 'joined'] as const
const fallback = { field: 'joined', dir: 'desc' } as const

describe('parseSort', () => {
  it('accepts whitelisted fields in both directions', () => {
    expect(parseSort('balance', FIELDS, fallback)).toEqual({ field: 'balance', dir: 'asc' })
    expect(parseSort('-username', FIELDS, fallback)).toEqual({ field: 'username', dir: 'desc' })
    expect(parseSort(['-balance', 'joined'], FIELDS, fallback)).toEqual({ field: 'balance', dir: 'desc' })
  })

  it.each([undefined, '', '-', '--balance', 'passwordHash', '-passwordHash', 'Balance', 'balance;drop'])(
    'falls back for %o',
    (raw) => {
      expect(parseSort(raw, FIELDS, fallback)).toEqual(fallback)
    },
  )

  it('round-trips through formatSort', () => {
    expect(formatSort({ field: 'joined', dir: 'desc' })).toBe('-joined')
    expect(formatSort({ field: 'balance', dir: 'asc' })).toBe('balance')
  })
})

describe('search and options', () => {
  it('trims and caps search text', () => {
    expect(parseSearch('  bob ')).toBe('bob')
    expect(parseSearch('   ')).toBeUndefined()
    expect(parseSearch(undefined)).toBeUndefined()
    expect(parseSearch('x'.repeat(150))).toHaveLength(100)
  })

  it('accepts only listed options', () => {
    expect(parseOption('OPEN', ['OPEN', 'CLOSED'] as const)).toBe('OPEN')
    expect(parseOption('all', ['OPEN', 'CLOSED'] as const)).toBeUndefined()
    expect(parseOption('open', ['OPEN', 'CLOSED'] as const)).toBeUndefined()
  })
})

describe('ET date filters', () => {
  it('accepts only real dates', () => {
    expect(parseEtDateParam('2026-11-11')).toBe('2026-11-11')
    expect(parseEtDateParam('2026-13-01')).toBeUndefined()
    expect(parseEtDateParam('11/11/2026')).toBeUndefined()
    expect(parseEtDateParam(undefined)).toBeUndefined()
  })

  it('turns an inclusive ET range into UTC bounds', () => {
    expect(etDateBounds('2026-11-10', '2026-11-11')).toEqual({
      gte: new Date('2026-11-10T05:00:00Z'),
      lt: new Date('2026-11-12T05:00:00Z'),
    })
    expect(etDateBounds(undefined, '2026-07-04')).toEqual({ lt: new Date('2026-07-05T04:00:00Z') })
    expect(etDateBounds()).toBeUndefined()
  })
})

describe('hrefWith', () => {
  it('patches search params and drops empty values', () => {
    expect(hrefWith('/admin/players', { q: 'bob', page: '3' }, { player: 'p1' })).toBe(
      '/admin/players?q=bob&page=3&player=p1',
    )
    expect(hrefWith('/admin/players', { q: 'bob', player: 'p1' }, { player: undefined })).toBe(
      '/admin/players?q=bob',
    )
    expect(hrefWith('/x', { q: ['a', 'b'], sort: '' }, { page: 2 })).toBe('/x?q=a&page=2')
    expect(hrefWith('/x', {}, {})).toBe('/x')
  })
})
```

`tests/integration/admin-overview.test.ts` (Review Focus #4: ET-day bucketing at 23:59:59 / 00:00 ET):
```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { getAdminBadges, getDailyVolume, getOverviewStats, getTopBettorsToday } from '@/server/admin/overview'
import { postEntry } from '@/server/ledger'
import { setLastSyncAt } from '@/server/settings'

import { makeGame, makeUser, resetDb } from '../helpers/db'

/** A BET ledger row of `stake` points created at `at`. */
async function betAt(userId: string, stake: number, at: Date) {
  const t = await prisma.$transaction((tx) => postEntry(tx, { userId, type: 'BET', amount: -stake }))
  await prisma.transaction.update({ where: { id: t.id }, data: { createdAt: at } })
}

describe('admin overview', () => {
  beforeEach(resetDb)

  it('buckets BET volume and house take by ET day', async () => {
    const u = await makeUser()
    const now = new Date('2026-11-11T17:00:00Z') // Nov 11 ET
    await betAt(u.id, 100, new Date('2026-11-11T04:59:59Z')) // 23:59:59 ET Nov 10
    await betAt(u.id, 40, new Date('2026-11-11T05:00:00Z')) // 00:00 ET Nov 11
    await betAt(u.id, 60, new Date('2026-11-11T16:00:00Z'))
    await betAt(u.id, 999, new Date('2026-10-01T16:00:00Z')) // outside the window
    await prisma.$transaction((tx) => postEntry(tx, { userId: u.id, type: 'ADMIN_GRANT', amount: 500 }))
    await makeGame({ status: 'SETTLED', houseTake: 30, settledAt: new Date('2026-11-11T03:00:00Z') }) // Nov 10 ET
    await makeGame({ status: 'SETTLED', houseTake: 12, settledAt: new Date('2026-11-11T12:00:00Z') })
    await makeGame({ status: 'FINAL', houseTake: 0 })

    const points = await getDailyVolume(14, now)
    expect(points).toHaveLength(14)
    expect(points[0]?.date).toBe('2026-10-29')
    expect(points.at(-1)).toEqual({ date: '2026-11-11', volume: 100, houseTake: 12 })
    expect(points.at(-2)).toEqual({ date: '2026-11-10', volume: 100, houseTake: 30 })
    expect(points.slice(0, -2).every((p) => p.volume === 0 && p.houseTake === 0)).toBe(true)
  })

  it('ranks today’s top bettors by BET volume in the ET day', async () => {
    const now = new Date('2026-11-12T03:00:00Z') // 22:00 ET Nov 11
    const users = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => makeUser({ username: `tb_${n}` })),
    )
    const stakes = [10, 70, 30, 50, 20, 60]
    for (const [i, u] of users.entries()) await betAt(u.id, stakes[i] ?? 0, new Date('2026-11-11T20:00:00Z'))
    const first = users[0]
    if (!first) throw new Error('setup')
    await betAt(first.id, 500, new Date('2026-11-11T04:00:00Z')) // Nov 10 ET: not today

    expect(await getTopBettorsToday(now)).toEqual([
      { userId: users[1]?.id, username: 'tb_b', volume: 70 },
      { userId: users[5]?.id, username: 'tb_f', volume: 60 },
      { userId: users[3]?.id, username: 'tb_d', volume: 50 },
      { userId: users[2]?.id, username: 'tb_c', volume: 30 },
      { userId: users[4]?.id, username: 'tb_e', volume: 20 },
    ])
  })

  it('computes KPI stats and needs-attention lists', async () => {
    const now = new Date('2026-11-11T17:00:00Z')
    await makeUser({ role: 'ADMIN' })
    const neg = await makeUser({ username: 'neg' })
    await makeUser({ username: 'old', createdAt: new Date('2026-10-01T00:00:00Z') })
    await prisma.$transaction((tx) => postEntry(tx, { userId: neg.id, type: 'REFUND', amount: -50 }))
    await makeGame({ status: 'SETTLED', houseTake: 100, settledAt: new Date('2026-11-05T12:00:00Z') }) // in 7 ET days
    await makeGame({ status: 'SETTLED', houseTake: 500, settledAt: new Date('2026-11-01T12:00:00Z') }) // older
    await makeGame({ status: 'SCHEDULED', pool: 300 })
    const pp = await makeGame({ status: 'POSTPONED', awayTeam: 'BOS', homeTeam: 'NYK' })
    const ticket = await prisma.inquiry.create({ data: { userId: neg.id, subject: 'Help' } })
    await setLastSyncAt(new Date('2026-11-11T16:45:00Z'))

    const s = await getOverviewStats(now)
    expect(s).toMatchObject({
      playerCount: 2,
      newPlayers7d: 1,
      openPoolTotal: 300,
      openPoolCount: 1,
      houseTake7d: 100,
      houseTakeAllTime: 600,
      syncStale: false,
      openTicketCount: 1,
    })
    expect(s.postponed.map((g) => g.id)).toEqual([pp.id])
    expect(s.negativeBalances).toEqual([{ id: neg.id, username: 'neg', balance: -50 }])
    expect(s.openTickets).toEqual([{ id: ticket.id, subject: 'Help', username: 'neg' }])
    expect(await getAdminBadges()).toEqual({ openTickets: 1, needsAttention: true })
  })

  it('flags a stale or missing sync and reports all clear', async () => {
    const now = new Date('2026-11-11T17:00:00Z')
    expect((await getOverviewStats(now)).syncStale).toBe(true)
    await setLastSyncAt(new Date('2026-11-11T16:29:59Z'))
    expect((await getOverviewStats(now)).syncStale).toBe(true)
    expect(await getAdminBadges()).toEqual({ openTickets: 0, needsAttention: false })
  })
})
```

`tests/integration/admin-tables.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { listAdminActions, parseAdminActionListParams } from '@/server/admin/tables/admin-actions'
import { listGames, parseGameListParams } from '@/server/admin/tables/games'
import { listLedger, parseLedgerListParams } from '@/server/admin/tables/ledger'
import { listPlayers, parsePlayerListParams } from '@/server/admin/tables/players'
import { listTickets, parseTicketListParams } from '@/server/admin/tables/tickets'
import { logAdminAction } from '@/server/audit'
import { postEntry } from '@/server/ledger'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('admin tables', () => {
  beforeEach(resetDb)

  it('players: search, status filter, whitelisted sort, pagination', async () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const ref = await makeUser({ username: 'Referrer' })
    await makeUser({ username: 'kyle', referredById: ref.id })
    await makeUser({ username: 'kylie', status: 'SUSPENDED' })
    await makeUser({
      username: 'expired',
      status: 'SUSPENDED',
      suspendedUntil: new Date('2026-11-01T00:00:00Z'),
    })
    await makeUser({ username: 'boss', role: 'ADMIN' })
    await fundUser(ref.id, 50)

    const byName = await listPlayers(parsePlayerListParams({ q: 'KY', sort: 'username' }), now)
    expect(byName.rows.map((r) => r.username)).toEqual(['kyle', 'kylie'])
    const suspended = await listPlayers(parsePlayerListParams({ status: 'suspended' }), now)
    expect(suspended.rows.map((r) => r.username)).toEqual(['kylie'])
    const active = await listPlayers(parsePlayerListParams({ status: 'active', sort: 'username' }), now)
    expect(active.rows.map((r) => r.username)).toEqual(['expired', 'kyle', 'Referrer'])
    const byBalance = await listPlayers(parsePlayerListParams({ sort: '-balance' }), now)
    expect(byBalance.rows[0]?.username).toBe('Referrer')
    const byRefs = await listPlayers(parsePlayerListParams({ sort: '-referrals' }), now)
    expect(byRefs.rows[0]).toMatchObject({ username: 'Referrer', _count: { referrals: 1 } })
    // unknown sort → default -joined (newest first); bad page → 1
    const fallback = await listPlayers(parsePlayerListParams({ sort: 'passwordHash', page: 'x' }), now)
    expect(fallback.page).toBe(1)
    expect(fallback.rows[0]?.username).toBe('expired')
    expect(fallback.rows.map((r) => r.username)).not.toContain('boss')

    for (let i = 0; i < 26; i++) await makeUser({ username: `bulk${i}` })
    const p2 = await listPlayers(parsePlayerListParams({ q: 'bulk', page: '2' }), now)
    expect(p2).toMatchObject({ total: 26, page: 2, pageCount: 2 })
    expect(p2.rows).toHaveLength(1)
  })

  it('games: status and ET date-range filters, team search, sort', async () => {
    const a = await makeGame({ startsAt: new Date('2026-11-10T23:00:00Z'), pool: 50 }) // Nov 10 ET
    const b = await makeGame({ startsAt: new Date('2026-11-12T03:00:00Z'), pool: 500, awayTeam: 'BOS' }) // Nov 11 ET
    const c = await makeGame({ startsAt: new Date('2026-11-12T06:00:00Z'), status: 'POSTPONED' }) // Nov 12 ET

    expect((await listGames(parseGameListParams({}))).rows.map((g) => g.id)).toEqual([c.id, b.id, a.id])
    expect((await listGames(parseGameListParams({ sort: 'pool' }))).rows.map((g) => g.id)).toEqual([
      c.id,
      a.id,
      b.id,
    ])
    expect((await listGames(parseGameListParams({ status: 'POSTPONED' }))).rows.map((g) => g.id)).toEqual([
      c.id,
    ])
    expect(
      (await listGames(parseGameListParams({ from: '2026-11-11', to: '2026-11-11' }))).rows.map((g) => g.id),
    ).toEqual([b.id])
    expect((await listGames(parseGameListParams({ q: 'bos' }))).rows.map((g) => g.id)).toEqual([b.id])
    expect((await listGames(parseGameListParams({ status: 'bogus', from: 'junk' }))).total).toBe(3)
  })

  it('ledger: username/type filters, totals for the whole filter', async () => {
    const kyle = await makeUser({ username: 'Kyle' })
    const bob = await makeUser({ username: 'bob' })
    await fundUser(kyle.id, 10)
    await fundUser(kyle.id, 15)
    await fundUser(bob.id, 7)
    await prisma.$transaction((tx) => postEntry(tx, { userId: kyle.id, type: 'BET', amount: -5 }))

    const grants = await listLedger(parseLedgerListParams({ q: 'KYLE', type: 'ADMIN_GRANT' }))
    expect(grants).toMatchObject({ total: 2, totalAmount: 25 })
    expect(grants.rows.every((r) => r.user.username === 'Kyle')).toBe(true)
    const all = await listLedger(parseLedgerListParams({ sort: 'amount' }))
    expect(all.rows.map((r) => r.amount)).toEqual([-5, 7, 10, 15])
    expect(all.totalAmount).toBe(27)
    const none = await listLedger(parseLedgerListParams({ from: '2000-01-01', to: '2000-01-02' }))
    expect(none).toMatchObject({ total: 0, totalAmount: 0, rows: [] })
  })

  it('tickets: default OPEN tab, search by subject or username', async () => {
    const kyle = await makeUser({ username: 'kyle' })
    const bob = await makeUser({ username: 'bob' })
    const t1 = await prisma.inquiry.create({ data: { userId: kyle.id, subject: 'Missing payout' } })
    const t2 = await prisma.inquiry.create({ data: { userId: bob.id, subject: 'Hello' } })
    await prisma.inquiry.create({ data: { userId: bob.id, subject: 'Old', status: 'CLOSED' } })

    expect((await listTickets(parseTicketListParams({}))).rows.map((t) => t.id).sort()).toEqual(
      [t1.id, t2.id].sort(),
    )
    expect((await listTickets(parseTicketListParams({ q: 'PAYOUT' }))).rows.map((t) => t.id)).toEqual([t1.id])
    expect((await listTickets(parseTicketListParams({ q: 'bob' }))).rows.map((t) => t.id)).toEqual([t2.id])
    expect((await listTickets(parseTicketListParams({ status: 'CLOSED' }))).total).toBe(1)
    expect((await listTickets(parseTicketListParams({ status: 'nope' }))).total).toBe(2)
  })

  it('admin actions: filter by action type', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    await prisma.$transaction(async (tx) => {
      await logAdminAction(tx, { adminId: admin.id, action: 'SUSPEND', targetUserId: p.id })
      await logAdminAction(tx, { adminId: admin.id, action: 'UPDATE_SETTING' })
    })
    expect((await listAdminActions(parseAdminActionListParams({}))).total).toBe(2)
    const suspends = await listAdminActions(parseAdminActionListParams({ action: 'SUSPEND' }))
    expect(suspends.rows.map((r) => [r.action, r.targetUser?.id])).toEqual([['SUSPEND', p.id]])
    expect((await listAdminActions(parseAdminActionListParams({ action: 'DROP' }))).total).toBe(2)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/table-params.test.ts tests/integration/admin-overview.test.ts tests/integration/admin-tables.test.ts`
Expected: FAIL — `Cannot find module '@/lib/table-params'`, `'@/server/admin/overview'` and `'@/server/admin/tables/players'`.

- [ ] **Step 3: Index migration**

In `prisma/schema.prisma`, model `Transaction`, add a line under `@@index([type])` (keep the existing indexes):
```prisma
  @@index([type, createdAt])
```
With Docker Postgres running and `.env` pointing at the dev DB:
```bash
npx prisma migrate dev --name transaction_type_created_at_index
```
Expected: a new folder `prisma/migrations/<timestamp>_transaction_type_created_at_index/` whose `migration.sql` is:
```sql
-- CreateIndex
CREATE INDEX "Transaction_type_createdAt_idx" ON "Transaction"("type", "createdAt");
```
and "Your database is now in sync with your schema". If Prisma asks to reset the database, stop: never reset. Find out why the dev DB drifted and report it. The test DB gets the migration through `migrate deploy` in `tests/global-setup.ts`.

- [ ] **Step 4: Implement `src/lib`**

`src/lib/table-params.ts` (Task 11 appends `toggleSort` and `isRecordId`):
```ts
import { etDayRange, isEtDate } from './dates'
import { firstParam } from './pagination'

/** Rows per admin table page (spec §5.2). */
export const TABLE_PAGE_SIZE = 25

export type SearchParams = Record<string, string | string[] | undefined>
export type Sort<F extends string> = { field: F; dir: 'asc' | 'desc' }

/** `?sort=field` / `?sort=-field` against a whitelist; anything else → the fallback (spec §5.2). */
export function parseSort<F extends string>(raw: unknown, allowed: readonly F[], fallback: Sort<F>): Sort<F> {
  const v = firstParam(raw)?.trim() ?? ''
  const desc = v.startsWith('-')
  const name = desc ? v.slice(1) : v
  const field = allowed.find((f) => f === name)
  return field ? { field, dir: desc ? 'desc' : 'asc' } : fallback
}

export function formatSort<F extends string>(sort: Sort<F>): string {
  return sort.dir === 'desc' ? `-${sort.field}` : sort.field
}

/** `?q=` → trimmed text (max 100 chars) or undefined. */
export function parseSearch(raw: unknown): string | undefined {
  const v = firstParam(raw)?.trim().slice(0, 100)
  return v ? v : undefined
}

/** A value from a fixed list, or undefined (`all`, junk and missing all mean "no filter"). */
export function parseOption<T extends string>(raw: unknown, options: readonly T[]): T | undefined {
  const v = firstParam(raw)
  return options.find((o) => o === v)
}

/** `?from=` / `?to=` → a valid 'YYYY-MM-DD' ET date or undefined. */
export function parseEtDateParam(raw: unknown): string | undefined {
  const v = firstParam(raw)
  return v && isEtDate(v) ? v : undefined
}

/** Inclusive ET date range → [from 00:00 ET, day after `to` 00:00 ET) bounds, or undefined. */
export function etDateBounds(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: etDayRange(from).start } : {}),
    ...(to ? { lt: etDayRange(to).end } : {}),
  }
}
```

`src/lib/url.ts` (Task 7 appends `isActivePath`):
```ts
import type { SearchParams } from './table-params'

/**
 * `basePath` + the current search params with `patch` applied (`undefined` removes a key).
 * Array values keep their first entry. Keys are emitted in insertion order.
 */
export function hrefWith(
  basePath: string,
  current: SearchParams,
  patch: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    const v = Array.isArray(value) ? value[0] : value
    if (v !== undefined && v !== '' && !(key in patch)) params.set(key, v)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
```

- [ ] **Step 5: Implement the server queries**

In `src/server/audit.ts`, replace the `AdminActionType` union with:
```ts
export const ADMIN_ACTION_TYPES = [
  'SUSPEND',
  'UNSUSPEND',
  'SET_STAKE_LIMIT',
  'RESET_PASSWORD',
  'VOID_GAME',
  'UPDATE_SETTING',
  'GRANT_POINTS',
  'DEDUCT_POINTS',
] as const

export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number]
```

`src/server/admin/overview.ts`. BET volume and house take are bucketed in SQL by ET day (`AT TIME ZONE 'UTC'` then `'America/New_York'`, because the columns are UTC `timestamp(3)`). The new index serves the `type = 'BET' AND createdAt` range scan.
```ts
import { addEtDays, etDateOf, etDayRange } from '@/lib/dates'
import { prisma } from '@/lib/db'

import { getLastSyncAt } from '../settings'

const SYNC_STALE_MS = 30 * 60 * 1000
const DAY_MS = 86_400_000
const ATTENTION_LIMIT = 10

export async function getOverviewStats(now: Date = new Date()) {
  const weekStart = etDayRange(addEtDays(etDateOf(now), -6)).start
  const [
    playerCount,
    newPlayers7d,
    openPools,
    houseTake7d,
    houseTakeAllTime,
    lastSyncAt,
    postponed,
    negativeBalances,
    openTickets,
    openTicketCount,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'PLAYER' } }),
    prisma.user.count({
      where: { role: 'PLAYER', createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
    }),
    prisma.game.aggregate({
      where: { status: { in: ['SCHEDULED', 'LIVE', 'FINAL'] }, pool: { gt: 0 } },
      _sum: { pool: true },
      _count: true,
    }),
    prisma.game.aggregate({
      where: { status: 'SETTLED', settledAt: { gte: weekStart } },
      _sum: { houseTake: true },
    }),
    prisma.game.aggregate({ where: { status: 'SETTLED' }, _sum: { houseTake: true } }),
    getLastSyncAt(),
    prisma.game.findMany({
      where: { status: 'POSTPONED' },
      select: { id: true, awayTeam: true, homeTeam: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
      take: ATTENTION_LIMIT,
    }),
    prisma.user.findMany({
      where: { balance: { lt: 0 } },
      select: { id: true, username: true, balance: true },
      orderBy: { balance: 'asc' },
      take: ATTENTION_LIMIT,
    }),
    prisma.inquiry.findMany({
      where: { status: 'OPEN' },
      select: { id: true, subject: true, user: { select: { username: true } } },
      orderBy: { updatedAt: 'asc' },
      take: ATTENTION_LIMIT,
    }),
    prisma.inquiry.count({ where: { status: 'OPEN' } }),
  ])
  return {
    playerCount,
    newPlayers7d,
    openPoolTotal: openPools._sum.pool ?? 0,
    openPoolCount: openPools._count,
    houseTake7d: houseTake7d._sum.houseTake ?? 0,
    houseTakeAllTime: houseTakeAllTime._sum.houseTake ?? 0,
    lastSyncAt,
    syncStale: !lastSyncAt || now.getTime() - lastSyncAt.getTime() > SYNC_STALE_MS,
    postponed,
    negativeBalances,
    openTickets: openTickets.map((t) => ({ id: t.id, subject: t.subject, username: t.user.username })),
    openTicketCount,
  }
}

export type DailyPoint = { date: string; volume: number; houseTake: number }

/**
 * The last `days` ET days ending today (oldest first). volume = Σ|amount| of BET transactions
 * created that ET day; houseTake = Σ houseTake of games settled that ET day (spec §5.1).
 */
export async function getDailyVolume(days: number, now: Date = new Date()): Promise<DailyPoint[]> {
  const today = etDateOf(now)
  const dates = Array.from({ length: days }, (_, i) => addEtDays(today, i - days + 1))
  const first = dates[0] ?? today
  const start = etDayRange(first).start
  const end = etDayRange(today).end
  const [volumes, takes] = await Promise.all([
    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
             SUM(ABS(amount))::bigint AS total
      FROM "Transaction"
      WHERE type = 'BET' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT to_char(("settledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
             SUM("houseTake")::bigint AS total
      FROM "Game"
      WHERE status = 'SETTLED' AND "settledAt" >= ${start} AND "settledAt" < ${end}
      GROUP BY 1`,
  ])
  const volumeBy = new Map(volumes.map((r) => [r.day, Number(r.total)]))
  const takeBy = new Map(takes.map((r) => [r.day, Number(r.total)]))
  return dates.map((date) => ({
    date,
    volume: volumeBy.get(date) ?? 0,
    houseTake: takeBy.get(date) ?? 0,
  }))
}

/** Top 5 players by BET volume in today's ET day. */
export async function getTopBettorsToday(now: Date = new Date()) {
  const { start, end } = etDayRange(etDateOf(now))
  const groups = await prisma.transaction.groupBy({
    by: ['userId'],
    where: { type: 'BET', createdAt: { gte: start, lt: end } },
    _sum: { amount: true },
    orderBy: [{ _sum: { amount: 'asc' } }, { userId: 'asc' }],
    take: 5,
  })
  const users = await prisma.user.findMany({
    where: { id: { in: groups.map((g) => g.userId) } },
    select: { id: true, username: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.username]))
  return groups.map((g) => ({
    userId: g.userId,
    username: nameById.get(g.userId) ?? '—',
    volume: -(g._sum.amount ?? 0),
  }))
}

/** Sidebar badges: open ticket count, and whether the overview has anything needing attention. */
export async function getAdminBadges() {
  const [openTickets, postponed, negative] = await Promise.all([
    prisma.inquiry.count({ where: { status: 'OPEN' } }),
    prisma.game.count({ where: { status: 'POSTPONED' } }),
    prisma.user.count({ where: { balance: { lt: 0 } } }),
  ])
  return { openTickets, needsAttention: openTickets + postponed + negative > 0 }
}
```

`src/server/admin/tables/players.ts`:
```ts
import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import {
  parseOption,
  parseSearch,
  parseSort,
  type SearchParams,
  type Sort,
  TABLE_PAGE_SIZE,
} from '@/lib/table-params'

export const PLAYER_SORTS = ['username', 'balance', 'joined', 'referrals'] as const
export const PLAYER_STATUSES = ['active', 'suspended'] as const

export type PlayerListParams = {
  q?: string
  sort: Sort<(typeof PLAYER_SORTS)[number]>
  page: number
  status?: (typeof PLAYER_STATUSES)[number]
}

export function parsePlayerListParams(sp: SearchParams): PlayerListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, PLAYER_SORTS, { field: 'joined', dir: 'desc' }),
    page: parsePage(sp.page),
    status: parseOption(sp.status, PLAYER_STATUSES),
  }
}

function orderBy(sort: PlayerListParams['sort']): Prisma.UserOrderByWithRelationInput {
  switch (sort.field) {
    case 'username':
      return { usernameKey: sort.dir }
    case 'balance':
      return { balance: sort.dir }
    case 'joined':
      return { createdAt: sort.dir }
    case 'referrals':
      return { referrals: { _count: sort.dir } }
  }
}

const select = {
  id: true,
  username: true,
  balance: true,
  status: true,
  suspendedUntil: true,
  stakeLimitPerGame: true,
  createdAt: true,
  _count: { select: { referrals: true } },
} satisfies Prisma.UserSelect

export type PlayerRow = Prisma.UserGetPayload<{ select: typeof select }>

export async function listPlayers(p: PlayerListParams, now: Date = new Date()): Promise<Page<PlayerRow>> {
  const suspendedNow: Prisma.UserWhereInput = {
    status: 'SUSPENDED',
    OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
  }
  const where: Prisma.UserWhereInput = {
    role: 'PLAYER',
    ...(p.q ? { usernameKey: { contains: p.q.toLowerCase() } } : {}),
    ...(p.status === 'suspended' ? suspendedNow : p.status === 'active' ? { NOT: suspendedNow } : {}),
  }
  const total = await prisma.user.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const rows = await prisma.user.findMany({
    where,
    select,
    orderBy: [orderBy(p.sort), { id: 'asc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
```

`src/server/admin/tables/games.ts`:
```ts
import { GameStatus, type Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import {
  etDateBounds,
  parseEtDateParam,
  parseOption,
  parseSearch,
  parseSort,
  type SearchParams,
  type Sort,
  TABLE_PAGE_SIZE,
} from '@/lib/table-params'

export const GAME_SORTS = ['tipoff', 'pool', 'houseTake', 'status'] as const
export const GAME_STATUSES = Object.values(GameStatus)

export type GameListParams = {
  q?: string
  sort: Sort<(typeof GAME_SORTS)[number]>
  page: number
  status?: GameStatus
  /** ET dates, inclusive. */
  from?: string
  to?: string
}

export function parseGameListParams(sp: SearchParams): GameListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, GAME_SORTS, { field: 'tipoff', dir: 'desc' }),
    page: parsePage(sp.page),
    status: parseOption(sp.status, GAME_STATUSES),
    from: parseEtDateParam(sp.from),
    to: parseEtDateParam(sp.to),
  }
}

function orderBy(sort: GameListParams['sort']): Prisma.GameOrderByWithRelationInput {
  switch (sort.field) {
    case 'tipoff':
      return { startsAt: sort.dir }
    case 'pool':
      return { pool: sort.dir }
    case 'houseTake':
      return { houseTake: sort.dir }
    case 'status':
      return { status: sort.dir }
  }
}

const include = { _count: { select: { bets: { where: { result: 'WON' } } } } } satisfies Prisma.GameInclude

export type GameRow = Prisma.GameGetPayload<{ include: typeof include }>

export async function listGames(p: GameListParams): Promise<Page<GameRow>> {
  const team = p.q?.toUpperCase()
  const startsAt = etDateBounds(p.from, p.to)
  const where: Prisma.GameWhereInput = {
    ...(p.status ? { status: p.status } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(team ? { OR: [{ awayTeam: { contains: team } }, { homeTeam: { contains: team } }] } : {}),
  }
  const total = await prisma.game.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const rows = await prisma.game.findMany({
    where,
    include,
    orderBy: [orderBy(p.sort), { id: 'asc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
```

`src/server/admin/tables/ledger.ts`:
```ts
import { type Prisma, TransactionType } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import {
  etDateBounds,
  parseEtDateParam,
  parseOption,
  parseSearch,
  parseSort,
  type SearchParams,
  type Sort,
  TABLE_PAGE_SIZE,
} from '@/lib/table-params'

export const LEDGER_SORTS = ['time', 'amount'] as const
export const LEDGER_TYPES = Object.values(TransactionType)

export type LedgerListParams = {
  /** Username search (contains, case-insensitive). */
  q?: string
  sort: Sort<(typeof LEDGER_SORTS)[number]>
  page: number
  type?: TransactionType
  from?: string
  to?: string
}

export function parseLedgerListParams(sp: SearchParams): LedgerListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, LEDGER_SORTS, { field: 'time', dir: 'desc' }),
    page: parsePage(sp.page),
    type: parseOption(sp.type, LEDGER_TYPES),
    from: parseEtDateParam(sp.from),
    to: parseEtDateParam(sp.to),
  }
}

const include = { user: { select: { id: true, username: true } } } satisfies Prisma.TransactionInclude

export type LedgerRow = Prisma.TransactionGetPayload<{ include: typeof include }>

/** Ledger rows plus the sum of amounts for the whole filter (spec §5.5 totals row). */
export async function listLedger(p: LedgerListParams): Promise<Page<LedgerRow> & { totalAmount: number }> {
  const createdAt = etDateBounds(p.from, p.to)
  const where: Prisma.TransactionWhereInput = {
    ...(p.q ? { user: { usernameKey: { contains: p.q.toLowerCase() } } } : {}),
    ...(p.type ? { type: p.type } : {}),
    ...(createdAt ? { createdAt } : {}),
  }
  const [total, sum] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
  ])
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const field = p.sort.field === 'time' ? 'createdAt' : 'amount'
  const rows = await prisma.transaction.findMany({
    where,
    include,
    orderBy: [{ [field]: p.sort.dir }, { id: p.sort.dir }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount, totalAmount: sum._sum.amount ?? 0 }
}
```

`src/server/admin/tables/tickets.ts`:
```ts
import { InquiryStatus, type Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import {
  parseOption,
  parseSearch,
  parseSort,
  type SearchParams,
  type Sort,
  TABLE_PAGE_SIZE,
} from '@/lib/table-params'

export const TICKET_SORTS = ['updated', 'created'] as const
export const TICKET_STATUSES = Object.values(InquiryStatus)

export type TicketListParams = {
  q?: string
  sort: Sort<(typeof TICKET_SORTS)[number]>
  page: number
  status: InquiryStatus
}

export function parseTicketListParams(sp: SearchParams): TicketListParams {
  return {
    q: parseSearch(sp.q),
    sort: parseSort(sp.sort, TICKET_SORTS, { field: 'updated', dir: 'desc' }),
    page: parsePage(sp.page),
    status: parseOption(sp.status, TICKET_STATUSES) ?? 'OPEN',
  }
}

const include = {
  user: { select: { id: true, username: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.InquiryInclude

export type TicketRow = Prisma.InquiryGetPayload<{ include: typeof include }>

export async function listTickets(p: TicketListParams): Promise<Page<TicketRow>> {
  const where: Prisma.InquiryWhereInput = {
    status: p.status,
    ...(p.q
      ? {
          OR: [
            { subject: { contains: p.q, mode: 'insensitive' } },
            { user: { usernameKey: { contains: p.q.toLowerCase() } } },
          ],
        }
      : {}),
  }
  const total = await prisma.inquiry.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const field = p.sort.field === 'updated' ? 'updatedAt' : 'createdAt'
  const rows = await prisma.inquiry.findMany({
    where,
    include,
    orderBy: [{ [field]: p.sort.dir }, { id: 'asc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
```

`src/server/admin/tables/admin-actions.ts`:
```ts
import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { type Page, pageWindow, parsePage } from '@/lib/pagination'
import { parseOption, type SearchParams, TABLE_PAGE_SIZE } from '@/lib/table-params'

import { ADMIN_ACTION_TYPES, type AdminActionType } from '../../audit'

export type AdminActionListParams = { page: number; action?: AdminActionType }

export function parseAdminActionListParams(sp: SearchParams): AdminActionListParams {
  return { page: parsePage(sp.page), action: parseOption(sp.action, ADMIN_ACTION_TYPES) }
}

const include = {
  admin: { select: { username: true } },
  targetUser: { select: { id: true, username: true } },
  targetGame: { select: { id: true, awayTeam: true, homeTeam: true } },
} satisfies Prisma.AdminActionInclude

export type AdminActionRow = Prisma.AdminActionGetPayload<{ include: typeof include }>

/** Admin action log, newest first (sorting is fixed). */
export async function listAdminActions(p: AdminActionListParams): Promise<Page<AdminActionRow>> {
  const where: Prisma.AdminActionWhereInput = p.action ? { action: p.action } : {}
  const total = await prisma.adminAction.count({ where })
  const w = pageWindow(total, p.page, TABLE_PAGE_SIZE)
  const rows = await prisma.adminAction.findMany({
    where,
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: w.skip,
    take: w.take,
  })
  return { rows, total, page: w.page, pageCount: w.pageCount }
}
```

In `src/server/admin/queries.ts`, delete the old `listAdminActions()` function; the paginated one above replaces it. In `src/app/admin/settings/page.tsx`, replace the import
```tsx
import { listAdminActions } from '@/server/admin/queries'
```
with
```tsx
import { listAdminActions } from '@/server/admin/tables/admin-actions'
```
and the data line
```tsx
  const [bonus, actions] = await Promise.all([getReferralBonus(), listAdminActions()])
```
with
```tsx
  const [bonus, { rows: actions }] = await Promise.all([getReferralBonus(), listAdminActions({ page: 1 })])
```

- [ ] **Step 6: Run them to verify they pass**

Run: `npx vitest run tests/unit/table-params.test.ts tests/integration/admin-overview.test.ts tests/integration/admin-tables.test.ts tests/integration/admin-queries.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Run `npm run check`, then:
```bash
git add prisma/schema.prisma prisma/migrations src/lib/table-params.ts src/lib/url.ts src/server/audit.ts src/server/admin src/app/admin/settings/page.tsx tests/unit/table-params.test.ts tests/integration/admin-overview.test.ts tests/integration/admin-tables.test.ts
git commit -m "feat: add admin overview and paginated table queries"
```

---

### Task 7: Player shell, auth pages and the logged-in redirect

**Files:**
- Create: `src/components/shell/player-nav.tsx`, `src/components/shell/player-header.tsx`, `src/components/logout-button.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(player)/more/page.tsx`
- Modify: `src/lib/url.ts` (append `isActivePath`), `src/app/(player)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`
- Test: `tests/unit/table-params.test.ts` (append), `tests/unit/admin-page-guards.test.ts` (restructure and add a coverage check)

**Interfaces:**
- Consumes: `PointsAmount` (Task 1), `formatPoints`, `firstParam` (Task 5), `logoutAction` (existing, `src/app/(auth)/actions.ts`), `getCurrentUser`.
- Produces:
  - `isActivePath(pathname, href, exact?)`;
  - `<PlayerHeader balance isAdmin />` (sticky top bar: logo, inline tabs on ≥768px, balance pill linking to `/wallet`, `Admin` link for admins);
  - `<PlayerTopNav />` and `<PlayerBottomNav />` (Games `/games` · Bets `/bets` · Wallet `/wallet` · More `/more`; the bottom bar is fixed and phone-only, `h-16`);
  - `<Logo href? />`;
  - `<LogoutButton className? />` (a form posting `logoutAction`, button text `Log out`);
  - `/more` with an Account card (username + `Log out`).
- E2E contract: the `Username`, `Password`, `Referral code (optional)` labels, the `Log in` / `Sign up` buttons, `Log out` on `/more`, and the logged-in redirect from `/login` and `/signup` to `/`.
- Layout padding: the player `main` has `pb-28` on phones so content clears the bottom bar (Task 8 raises it for the slip bar).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/table-params.test.ts`: change the url import to `import { hrefWith, isActivePath } from '@/lib/url'` and add at the end:
```ts

describe('isActivePath', () => {
  it('matches a section and its children, or exactly', () => {
    expect(isActivePath('/games/abc', '/games')).toBe(true)
    expect(isActivePath('/games', '/games')).toBe(true)
    expect(isActivePath('/gamesx', '/games')).toBe(false)
    expect(isActivePath('/admin/players', '/admin', true)).toBe(false)
    expect(isActivePath('/admin', '/admin', true)).toBe(true)
  })
})
```

Replace `tests/unit/admin-page-guards.test.ts`.
- Every case is keyed by its path under `src/app`, and the last test fails if a page on disk is missing from the lists, so every later task that adds, moves or deletes a page must update them.
- Pages that render the Log out form import next-auth through `src/app/(auth)/actions.ts`, which does not load under Vitest, so that module is mocked.
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listFiles } from '../architecture/rules'

const SENTINEL = new Error('GUARD_SENTINEL')

vi.mock('@/server/session', () => ({
  requireAdmin: vi.fn(async () => {
    throw SENTINEL
  }),
  requireUser: vi.fn(async () => {
    throw SENTINEL
  }),
  getCurrentUser: vi.fn(async () => null),
}))

// Pages that render the Log out form import next-auth, which does not load under Vitest.
vi.mock('@/app/(auth)/actions', () => ({
  loginAction: vi.fn(),
  signupAction: vi.fn(),
  logoutAction: vi.fn(),
}))

// Any data access (Prisma) before the guard is a bug: record it.
const dataSpies = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('@/lib/db', () => ({
  prisma: new Proxy(
    {},
    {
      get(_t, prop) {
        dataSpies.calls.push(String(prop))
        throw new Error(`prisma.${String(prop)} accessed before auth guard`)
      },
    },
  ),
}))

type PageCase = [string, () => Promise<{ default: (p: never) => Promise<unknown> }>, object]

const sp = (v: object = {}) => ({ searchParams: Promise.resolve(v) })
const params = (v: object) => ({ params: Promise.resolve(v), searchParams: Promise.resolve({}) })

// Keys are the page's path under src/app (without /page.tsx); the last test checks none is missing.
const adminPages: PageCase[] = [
  ['admin', () => import('@/app/admin/page'), sp()],
  ['admin/players', () => import('@/app/admin/players/page'), sp()],
  ['admin/players/[id]', () => import('@/app/admin/players/[id]/page'), params({ id: 'x' })],
  ['admin/games', () => import('@/app/admin/games/page'), sp()],
  ['admin/transactions', () => import('@/app/admin/transactions/page'), sp()],
  ['admin/inquiries', () => import('@/app/admin/inquiries/page'), sp()],
  ['admin/inquiries/[id]', () => import('@/app/admin/inquiries/[id]/page'), params({ id: 'x' })],
  ['admin/settings', () => import('@/app/admin/settings/page'), sp()],
]

const playerPages: PageCase[] = [
  ['(player)/bets', () => import('@/app/(player)/bets/page'), sp()],
  ['(player)/games', () => import('@/app/(player)/games/page'), sp()],
  ['(player)/games/[id]', () => import('@/app/(player)/games/[id]/page'), params({ id: 'x' })],
  ['(player)/inquiries', () => import('@/app/(player)/inquiries/page'), sp()],
  ['(player)/inquiries/[id]', () => import('@/app/(player)/inquiries/[id]/page'), params({ id: 'x' })],
  ['(player)/more', () => import('@/app/(player)/more/page'), sp()],
  ['(player)/referral', () => import('@/app/(player)/referral/page'), sp()],
  ['(player)/wallet', () => import('@/app/(player)/wallet/page'), sp()],
]

const pageKey = (file: string) => file.replace(/^src\/app\//, '').replace(/\/page\.tsx$/, '')

describe('page-level auth guards (layout guards can be skipped by RSC requests)', () => {
  beforeEach(() => {
    dataSpies.calls.length = 0
  })

  it.each(adminPages)(
    '%s rejects before any data access when requireAdmin throws',
    async (_n, load, props) => {
      const mod = await load()
      await expect(mod.default(props as never)).rejects.toBe(SENTINEL)
      expect(dataSpies.calls).toEqual([])
    },
  )

  it.each(playerPages)(
    '%s rejects before any data access when requireUser throws',
    async (_n, load, props) => {
      const mod = await load()
      await expect(mod.default(props as never)).rejects.toBe(SENTINEL)
      expect(dataSpies.calls).toEqual([])
    },
  )

  it('covers every admin and player page', () => {
    const onDisk = [
      ...listFiles('src/app/admin', /^page\.tsx$/),
      ...listFiles('src/app/(player)', /^page\.tsx$/),
    ].map(pageKey)
    const listed = [...adminPages, ...playerPages].map(([key]) => key)
    expect(listed.sort()).toEqual(onDisk.sort())
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/table-params.test.ts tests/unit/admin-page-guards.test.ts`
Expected: FAIL — `isActivePath is not a function`, and `Cannot find module '@/app/(player)/more/page'`.

- [ ] **Step 3: Implement**

Append to `src/lib/url.ts`:
```ts

/** Nav highlighting: `/games/abc` is inside `/games`; with `exact`, only the path itself matches. */
export function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
```

`src/components/shell/player-nav.tsx`:
```tsx
'use client'

import { CalendarDays, Menu, Ticket, Wallet } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isActivePath } from '@/lib/url'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/games', label: 'Games', icon: CalendarDays },
  { href: '/bets', label: 'Bets', icon: Ticket },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/more', label: 'More', icon: Menu },
]

/** Inline tabs in the desktop top bar (≥ 768px). */
export function PlayerTopNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV.map((item) => {
        const active = isActivePath(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-surface-2 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Fixed bottom tab bar on phones (< 768px). */
export function PlayerBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Tabs"
      className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <item.icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

`src/components/shell/player-header.tsx`:
```tsx
import Link from 'next/link'

import { PointsAmount } from '@/components/points-amount'
import { formatPoints } from '@/lib/format'

import { PlayerTopNav } from './player-nav'

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="text-lg font-black tracking-tight">
      Last<span className="text-primary">Digit</span>
    </Link>
  )
}

export function PlayerHeader({ balance, isAdmin }: { balance: number; isAdmin: boolean }) {
  return (
    <header className="bg-background/95 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Logo href="/games" />
        <PlayerTopNav />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
              Admin
            </Link>
          )}
          <Link
            href="/wallet"
            aria-label={`Balance: ${formatPoints(balance)} points`}
            className="bg-surface-2 border-border hover:border-primary/60 rounded-full border px-3 py-1 text-sm"
          >
            <PointsAmount value={balance} unit className="text-primary font-semibold" />
          </Link>
        </div>
      </div>
    </header>
  )
}
```

`src/components/logout-button.tsx`:
```tsx
import { logoutAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <Button type="submit" variant="outline">
        Log out
      </Button>
    </form>
  )
}
```

`src/app/(player)/layout.tsx` — replace. Task 8 adds the slip; `requireUser` stays here, but every page still guards itself.
```tsx
import { PlayerHeader } from '@/components/shell/player-header'
import { PlayerBottomNav } from '@/components/shell/player-nav'
import { requireUser } from '@/server/session'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="min-h-dvh">
      <PlayerHeader balance={user.balance} isAdmin={user.role === 'ADMIN'} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28 md:pb-10">{children}</main>
      <PlayerBottomNav />
    </div>
  )
}
```

`src/app/(player)/more/page.tsx` (Task 10 adds the Referral and Support links):
```tsx
import { LogoutButton } from '@/components/logout-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/server/session'

export default async function MorePage() {
  const user = await requireUser()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">More</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="text-muted-foreground text-xs">Signed in as</div>
            <div className="font-semibold">{user.username}</div>
          </div>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  )
}
```

`src/app/(auth)/layout.tsx`:
```tsx
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="text-3xl font-black tracking-tight">
        Last<span className="text-primary">Digit</span>
      </Link>
      <p className="text-muted-foreground mt-2 mb-6 text-center text-sm">
        Pick the last digit of each team&apos;s final score
      </p>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
```

`src/app/(auth)/login/page.tsx` — replace (same fields and action; a logged-in visitor is sent to `/`):
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ActionForm } from '@/components/action-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrentUser } from '@/server/session'

import { loginAction } from '../actions'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Log in</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={loginAction} submitLabel="Log in" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        No account?{' '}
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </>
  )
}
```

`src/app/(auth)/signup/page.tsx` — replace (`?ref=` is read through `firstParam` and capped at 32 chars):
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ActionForm } from '@/components/action-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { firstParam } from '@/lib/pagination'
import { getCurrentUser } from '@/server/session'

import { signupAction } from '../actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  if (await getCurrentUser()) redirect('/')
  const ref = firstParam((await searchParams).ref)?.slice(0, 32) ?? ''
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign up</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={signupAction} submitLabel="Sign up" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" required />
              <p className="text-muted-foreground text-xs">3–20 letters, numbers or underscores</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input id="referralCode" name="referralCode" defaultValue={ref} />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </>
  )
}
```

`src/components/nav.tsx` is still used by the admin layout until Task 11, so leave it.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/unit/table-params.test.ts tests/unit/admin-page-guards.test.ts tests/architecture.test.ts`
Expected: PASS (the guard coverage check lists 16 pages).

- [ ] **Step 5: Manual check**

Run `npm run dev -- -p 3005` and check the following.
- At 390px width (devtools iPhone), `/games` shows the top bar with logo and balance pill and a fixed bottom tab bar (Games · Bets · Wallet · More).
- At ≥768px the tabs move inline into the top bar and the bottom bar disappears.
- `/more` shows your username and `Log out`, which goes to `/login`.
- While logged in, `/login` and `/signup` redirect to `/games` (player) or `/admin` (admin).
- The auth pages show a centered card with "Pick the last digit of each team's final score".

Stop the server.

- [ ] **Step 6: Commit**

Run `npm run check`, then:
```bash
git add src/lib/url.ts src/components/shell src/components/logout-button.tsx "src/app/(player)/layout.tsx" "src/app/(player)/more/page.tsx" "src/app/(auth)" tests/unit/table-params.test.ts tests/unit/admin-page-guards.test.ts
git commit -m "feat: add phone-first player shell and restyled auth pages"
```

---

### Task 8: Bet slip — reducer, localStorage, UI and `placeBetsAction`

**Files:**
- Create: `src/lib/slip.ts`, `src/components/bet-slip/slip-provider.tsx`, `src/components/bet-slip/bet-slip-panel.tsx`, `src/components/bet-slip/slip-dock.tsx`
- Modify: `src/app/(player)/actions.ts` (add two actions), `src/app/(player)/layout.tsx`
- Test: `tests/unit/slip.test.ts`

**Interfaces:**
- Consumes: `placeBets` (Task 4), `getSlipStatus` (Task 5), `estimatePayout` (Task 3), `MAX_SLIP_PICKS`, `MAX_STAKE` (Task 4), `PointsAmount`.
- Produces (`src/lib/slip.ts`):
  - `DEFAULT_STAKE = 100`, `QUICK_STAKES = [10, 50, 100]`;
  - `type SlipPick = { gameId; awayDigit; homeDigit; stake; matchup }`, `type NewPick = Omit<SlipPick,'stake'>`, `type Slip = { picks; lastStake }`, `EMPTY_SLIP`;
  - `slipReducer(slip, action)` with actions `add | remove | setStake | addStake | setMax | clear | load`;
  - `canAdd`, `samePick`, `slipTotal`, `maxStakeFor(picks, index, balance)`, `parseStakeInput(text)`, `slipStorageKey(userId)` (`lastdigit.slip.<userId>`), `parseStoredSlip(raw)`.
- Produces (`src/app/(player)/actions.ts`):
  - `placeBetsAction(picks: unknown): Promise<ActionState>`, which returns `ok` `"1 bet placed"` / `"N bets placed"`, or `error` + `pickIndex`;
  - `getSlipStatusAction(picks: unknown): Promise<SlipStatus>`.
- Produces (components):
  - `<SlipProvider userId balance>`;
  - `useSlip()` → `{ picks, lastStake, balance, add(pick: NewPick), remove, setStake, addStake, setMax, clear, sheetOpen, setSheetOpen }`. `add` toasts "The slip holds at most 20 picks" when full;
  - `<SlipColumn />` (desktop sticky 320px column titled "Bet slip");
  - `<SlipBar />` (phone floating bar `Open bet slip (N pick(s))` and a bottom Sheet).
- E2E contract: `Open bet slip…`, `Confirm bets`, toast `1 bet placed`.

- [ ] **Step 1: Write the failing test**

`tests/unit/slip.test.ts` (Review Focus #3: broken or foreign saved slips and junk stake input):
```ts
import { describe, expect, it } from 'vitest'

import {
  canAdd,
  EMPTY_SLIP,
  maxStakeFor,
  parseStakeInput,
  parseStoredSlip,
  type Slip,
  slipReducer,
  slipStorageKey,
  slipTotal,
} from '@/lib/slip'

const pick = (gameId: string, a = 9, h = 6) => ({ gameId, awayDigit: a, homeDigit: h, matchup: 'LAL @ GSW' })
const add = (slip: Slip, p = pick('g1')) => slipReducer(slip, { type: 'add', pick: p })

describe('slipReducer', () => {
  it('adds a pick at the last-used stake (default 100)', () => {
    const s = add(EMPTY_SLIP)
    expect(s.picks).toEqual([{ ...pick('g1'), stake: 100 }])
  })

  it('merges the same game and ending by adding the stake', () => {
    const s = add(add(EMPTY_SLIP))
    expect(s.picks).toHaveLength(1)
    expect(s.picks[0]?.stake).toBe(200)
    expect(add(s, pick('g1', 1, 2)).picks).toHaveLength(2)
  })

  it('removes, sets and bumps stakes; typed and bumped stakes become the last-used stake', () => {
    let s = add(add(EMPTY_SLIP), pick('g2'))
    s = slipReducer(s, { type: 'setStake', index: 0, stake: 40 })
    expect(s.picks[0]?.stake).toBe(40)
    expect(s.lastStake).toBe(40)
    s = slipReducer(s, { type: 'addStake', index: 1, amount: 50 })
    expect(s.picks[1]?.stake).toBe(150)
    expect(s.lastStake).toBe(150)
    s = slipReducer(s, { type: 'setStake', index: 0, stake: 0 }) // cleared input
    expect(s.picks[0]?.stake).toBe(0)
    expect(s.lastStake).toBe(150)
    s = slipReducer(s, { type: 'remove', index: 0 })
    expect(s.picks.map((p) => p.gameId)).toEqual(['g2'])
    expect(slipReducer(s, { type: 'setStake', index: 7, stake: 5 })).toBe(s) // unknown index: no-op
    expect(slipReducer(s, { type: 'clear' }).picks).toEqual([])
  })

  it('sets Max to the balance minus the other picks, never below 0', () => {
    let s = add(add(EMPTY_SLIP), pick('g2')) // 100 + 100
    s = slipReducer(s, { type: 'setMax', index: 1, balance: 350 })
    expect(s.picks[1]?.stake).toBe(250)
    s = slipReducer(s, { type: 'setMax', index: 1, balance: 50 })
    expect(s.picks[1]?.stake).toBe(0)
    expect(maxStakeFor([], 0, -10)).toBe(0)
  })

  it('caps the slip at 20 picks but still merges into existing ones', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 20; i++) s = add(s, pick(`g${i}`))
    expect(s.picks).toHaveLength(20)
    expect(canAdd(s, pick('g20'))).toBe(false)
    expect(add(s, pick('g20'))).toBe(s)
    expect(canAdd(s, pick('g3'))).toBe(true)
    expect(add(s, pick('g3')).picks[3]?.stake).toBe(200)
    expect(slipTotal(s.picks)).toBe(2000)
  })
})

describe('slip input and storage', () => {
  it('parses stake input as whole numbers only', () => {
    expect(parseStakeInput('250')).toBe(250)
    expect(parseStakeInput(' 7 ')).toBe(7)
    for (const bad of ['', '-5', '1.5', '1e3', 'abc']) expect(parseStakeInput(bad)).toBe(0)
    expect(parseStakeInput('99999999999')).toBe(0)
  })

  it('round-trips a saved slip and treats missing or broken values as empty', () => {
    const s = add(EMPTY_SLIP)
    expect(parseStoredSlip(JSON.stringify(s))).toEqual(s)
    expect(parseStoredSlip(null)).toEqual(EMPTY_SLIP)
    expect(parseStoredSlip('{not json')).toEqual(EMPTY_SLIP)
    expect(
      parseStoredSlip(JSON.stringify({ picks: [{ gameId: 'g', awayDigit: 12 }], lastStake: 1 })),
    ).toEqual(EMPTY_SLIP)
    expect(parseStoredSlip('[]')).toEqual(EMPTY_SLIP)
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ ...pick(`g${i}`), stake: 1 }))
    expect(parseStoredSlip(JSON.stringify({ picks: tooMany, lastStake: 100 }))).toEqual(EMPTY_SLIP)
    expect(slipStorageKey('u1')).toBe('lastdigit.slip.u1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/slip.test.ts`
Expected: FAIL — `Cannot find module '@/lib/slip'`.

- [ ] **Step 3: Implement the reducer**

`src/lib/slip.ts`:
```ts
import { z } from 'zod'

import { MAX_SLIP_PICKS, MAX_STAKE } from './game/limits'

export const DEFAULT_STAKE = 100
export const QUICK_STAKES = [10, 50, 100] as const

export type SlipPick = {
  gameId: string
  awayDigit: number
  homeDigit: number
  stake: number
  /** "LAL @ GSW", for display only; never sent to the server. */
  matchup: string
}
export type NewPick = Omit<SlipPick, 'stake'>
export type Slip = { picks: SlipPick[]; lastStake: number }

export type SlipAction =
  | { type: 'add'; pick: NewPick }
  | { type: 'remove'; index: number }
  | { type: 'setStake'; index: number; stake: number }
  | { type: 'addStake'; index: number; amount: number }
  | { type: 'setMax'; index: number; balance: number }
  | { type: 'clear' }
  | { type: 'load'; slip: Slip }

export const EMPTY_SLIP: Slip = { picks: [], lastStake: DEFAULT_STAKE }

export function samePick(a: Omit<NewPick, 'matchup'>, b: Omit<NewPick, 'matchup'>): boolean {
  return a.gameId === b.gameId && a.awayDigit === b.awayDigit && a.homeDigit === b.homeDigit
}

/** False only when the pick is new and the slip already holds MAX_SLIP_PICKS. */
export function canAdd(slip: Slip, pick: NewPick): boolean {
  return slip.picks.some((p) => samePick(p, pick)) || slip.picks.length < MAX_SLIP_PICKS
}

export function slipTotal(picks: SlipPick[]): number {
  return picks.reduce((sum, p) => sum + p.stake, 0)
}

/** Max = balance minus the other picks' stakes, never below 0 (spec §4.3). */
export function maxStakeFor(picks: SlipPick[], index: number, balance: number): number {
  const others = picks.reduce((sum, p, i) => (i === index ? sum : sum + p.stake), 0)
  return Math.max(0, Math.min(MAX_STAKE, balance - others))
}

/** Stake input text → whole number in [0, MAX_STAKE]; anything that is not digits is 0. */
export function parseStakeInput(text: string): number {
  const t = text.trim()
  return /^\d{1,10}$/.test(t) ? Math.min(MAX_STAKE, Number(t)) : 0
}

function updateAt(slip: Slip, index: number, stake: number, remember: boolean): Slip {
  if (!slip.picks[index]) return slip
  const clamped = Math.max(0, Math.min(MAX_STAKE, Math.floor(stake)))
  return {
    picks: slip.picks.map((p, i) => (i === index ? { ...p, stake: clamped } : p)),
    lastStake: remember && clamped >= 1 ? clamped : slip.lastStake,
  }
}

export function slipReducer(slip: Slip, action: SlipAction): Slip {
  switch (action.type) {
    case 'add': {
      const at = slip.picks.findIndex((p) => samePick(p, action.pick))
      if (at >= 0) return updateAt(slip, at, (slip.picks[at]?.stake ?? 0) + slip.lastStake, false)
      if (slip.picks.length >= MAX_SLIP_PICKS) return slip
      return { ...slip, picks: [...slip.picks, { ...action.pick, stake: slip.lastStake }] }
    }
    case 'remove':
      return { ...slip, picks: slip.picks.filter((_, i) => i !== action.index) }
    case 'setStake':
      return updateAt(slip, action.index, action.stake, true)
    case 'addStake':
      return updateAt(slip, action.index, (slip.picks[action.index]?.stake ?? 0) + action.amount, true)
    case 'setMax':
      return updateAt(slip, action.index, maxStakeFor(slip.picks, action.index, action.balance), false)
    case 'clear':
      return { ...slip, picks: [] }
    case 'load':
      return action.slip
  }
}

export function slipStorageKey(userId: string): string {
  return `lastdigit.slip.${userId}`
}

const storedSlipSchema = z.object({
  picks: z
    .array(
      z.object({
        gameId: z.string().min(1).max(64),
        awayDigit: z.number().int().min(0).max(9),
        homeDigit: z.number().int().min(0).max(9),
        stake: z.number().int().min(0).max(MAX_STAKE),
        matchup: z.string().max(40),
      }),
    )
    .max(MAX_SLIP_PICKS),
  lastStake: z.number().int().min(1).max(MAX_STAKE),
})

/** A saved slip, or an empty one when the value is missing or cannot be parsed (spec §4.3). */
export function parseStoredSlip(raw: string | null): Slip {
  if (!raw) return EMPTY_SLIP
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (e) {
    console.warn('bet slip: ignoring unreadable saved slip', e)
    return EMPTY_SLIP
  }
  const parsed = storedSlipSchema.safeParse(data)
  return parsed.success ? parsed.data : EMPTY_SLIP
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/slip.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Server actions**

In `src/app/(player)/actions.ts`:
- add the imports `import { placeBet, placeBets } from '@/server/bets'` (replacing the `placeBet` import) and `import { getSlipStatus } from '@/server/queries/player'`;
- add these two actions after `placeBetAction` (Task 9 deletes `placeBetAction`). Revalidating the root layout refreshes the balance pill and every page.

```ts
/** Places every pick in the slip or none (spec §4.3); `pickIndex` marks the failing pick. */
export async function placeBetsAction(picks: unknown): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(
    () => placeBets(user.id, picks),
    (bets) => `${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} placed`,
  )
  revalidatePath('/', 'layout')
  return result
}

/** Fresh open/pool/ending-stake data for the slip's picks, plus the balance. */
export async function getSlipStatusAction(picks: unknown) {
  const user = await requireUser()
  return getSlipStatus(user.id, picks)
}
```

- [ ] **Step 6: Slip components**

`src/components/bet-slip/slip-provider.tsx`. It loads the slip from `localStorage` after mount, falling back to memory when storage throws, and saves on every change:
```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'

import { MAX_SLIP_PICKS } from '@/lib/game/limits'
import {
  canAdd,
  EMPTY_SLIP,
  type NewPick,
  parseStoredSlip,
  type SlipPick,
  slipReducer,
  slipStorageKey,
} from '@/lib/slip'

type SlipContextValue = {
  picks: SlipPick[]
  lastStake: number
  /** Balance from the last server render; the slip refreshes it via getSlipStatusAction. */
  balance: number
  add: (pick: NewPick) => void
  remove: (index: number) => void
  setStake: (index: number, stake: number) => void
  addStake: (index: number, amount: number) => void
  setMax: (index: number, balance: number) => void
  clear: () => void
  /** Phone bottom-sheet state. */
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
}

const SlipContext = createContext<SlipContextValue | null>(null)

// localStorage can be missing or throw (private mode): the slip then lives in memory only (spec §7).
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch (e) {
    console.warn('bet slip: localStorage unavailable, keeping the slip in memory', e)
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch (e) {
    console.warn('bet slip: could not save the slip', e)
  }
}

export function SlipProvider({
  userId,
  balance,
  children,
}: {
  userId: string
  balance: number
  children: React.ReactNode
}) {
  const key = slipStorageKey(userId)
  const [slip, dispatch] = useReducer(slipReducer, EMPTY_SLIP)
  const [loaded, setLoaded] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    dispatch({ type: 'load', slip: parseStoredSlip(readStorage(key)) })
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (loaded) writeStorage(key, JSON.stringify(slip))
  }, [key, loaded, slip])

  const add = useCallback(
    (pick: NewPick) => {
      if (!canAdd(slip, pick)) {
        toast.error(`The slip holds at most ${MAX_SLIP_PICKS} picks`)
        return
      }
      dispatch({ type: 'add', pick })
      toast.success(`Added ${pick.matchup} ${pick.awayDigit}-${pick.homeDigit} to the slip`)
    },
    [slip],
  )

  const value = useMemo<SlipContextValue>(
    () => ({
      picks: slip.picks,
      lastStake: slip.lastStake,
      balance,
      add,
      remove: (index) => dispatch({ type: 'remove', index }),
      setStake: (index, stake) => dispatch({ type: 'setStake', index, stake }),
      addStake: (index, amount) => dispatch({ type: 'addStake', index, amount }),
      setMax: (index, bal) => dispatch({ type: 'setMax', index, balance: bal }),
      clear: () => dispatch({ type: 'clear' }),
      sheetOpen,
      setSheetOpen,
    }),
    [slip, balance, add, sheetOpen],
  )

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext)
  if (!ctx) throw new Error('useSlip must be used inside <SlipProvider>')
  return ctx
}
```

`src/components/bet-slip/bet-slip-panel.tsx`.
- It refreshes the status on mount (= when the slip opens) and whenever the set of picks changes.
- It re-checks before confirming, greys out closed picks, and disables Confirm on closed picks, zero stakes or total > balance.
- On failure it highlights the failing pick and toasts the error.
```tsx
'use client'

import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { getSlipStatusAction, placeBetsAction } from '@/app/(player)/actions'
import { PointsAmount } from '@/components/points-amount'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEnding } from '@/lib/game/ending'
import { estimatePayout } from '@/lib/game/payout'
import { parseStakeInput, QUICK_STAKES, type SlipPick, slipTotal } from '@/lib/slip'
import { cn } from '@/lib/utils'

import { useSlip } from './slip-provider'

type PickKey = { gameId: string; awayDigit: number; homeDigit: number }
type PickStatusView = PickKey & { open: boolean; pool: number; endingStake: number }
type SlipStatusView = { balance: number; picks: PickStatusView[] }

const keyOf = (p: PickKey) => `${p.gameId}:${p.awayDigit}-${p.homeDigit}`
const toKeys = (picks: SlipPick[]): PickKey[] =>
  picks.map(({ gameId, awayDigit, homeDigit }) => ({ gameId, awayDigit, homeDigit }))

/** Bet slip contents: pick rows, totals and Confirm bets (spec §4.3). */
export function BetSlipPanel() {
  const slip = useSlip()
  const router = useRouter()
  const [status, setStatus] = useState<SlipStatusView | null>(null)
  const [failedIndex, setFailedIndex] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const picksRef = useRef(slip.picks)

  useEffect(() => {
    picksRef.current = slip.picks
  }, [slip.picks])

  // Fresh status whenever the slip opens (mounts) or the set of picks changes — not on stake edits.
  const pickKeys = slip.picks.map(keyOf).join('|')
  useEffect(() => {
    if (pickKeys === '') return
    let cancelled = false
    getSlipStatusAction(toKeys(picksRef.current))
      .then((fresh) => {
        if (!cancelled) setStatus(fresh)
      })
      .catch((e: unknown) => console.error('bet slip: status refresh failed', e))
    return () => {
      cancelled = true
    }
  }, [pickKeys])

  if (slip.picks.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Your slip is empty. Pick an ending on a game to add it.
      </p>
    )
  }

  const statusByKey = new Map(status?.picks.map((s) => [keyOf(s), s]))
  const balance = status?.balance ?? slip.balance
  const total = slipTotal(slip.picks)
  const anyClosed = slip.picks.some((p) => statusByKey.get(keyOf(p))?.open === false)
  const anyInvalid = slip.picks.some((p) => p.stake < 1)
  const estimatedReturn = slip.picks.reduce((sum, p) => {
    const s = statusByKey.get(keyOf(p))
    return sum + (s ? estimatePayout(s.pool, s.endingStake, p.stake) : 0)
  }, 0)
  const disabled = pending || total > balance || anyClosed || anyInvalid

  function confirm() {
    startTransition(async () => {
      setFailedIndex(null)
      const picks = picksRef.current
      const fresh = await getSlipStatusAction(toKeys(picks))
      setStatus(fresh)
      if (fresh.picks.some((s) => !s.open)) {
        toast.error('Remove the picks marked "Betting closed" first')
        return
      }
      const result = await placeBetsAction(
        picks.map(({ gameId, awayDigit, homeDigit, stake }) => ({ gameId, awayDigit, homeDigit, stake })),
      )
      if (result.error) {
        setFailedIndex(result.pickIndex ?? null)
        toast.error(result.error)
        return
      }
      slip.clear()
      slip.setSheetOpen(false)
      toast.success(result.ok)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {slip.picks.map((p, i) => {
          const s = statusByKey.get(keyOf(p))
          const closed = s?.open === false
          const label = `${p.matchup} ${formatEnding(p)}`
          return (
            <li
              key={keyOf(p)}
              aria-invalid={failedIndex === i || undefined}
              className={cn(
                'bg-surface-2 border-border rounded-lg border p-3',
                closed && 'opacity-60',
                failedIndex === i && 'border-danger ring-danger/40 ring-2',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{p.matchup}</div>
                  <div className="num text-primary text-lg font-semibold">{formatEnding(p)}</div>
                  {closed && <div className="text-live text-xs font-medium">Betting closed</div>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${label}`}
                  onClick={() => slip.remove(i)}
                >
                  <X />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  aria-label={`Stake for ${label}`}
                  className="num h-8 w-24"
                  value={p.stake === 0 ? '' : p.stake}
                  onChange={(e) => slip.setStake(i, parseStakeInput(e.target.value))}
                  disabled={closed}
                />
                {QUICK_STAKES.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Add ${amount} to ${label}`}
                    onClick={() => slip.addStake(i, amount)}
                    disabled={closed}
                  >
                    +{amount}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Max stake for ${label}`}
                  onClick={() => slip.setMax(i, balance)}
                  disabled={closed}
                >
                  Max
                </Button>
              </div>
              {s && !closed && (
                <div className="text-muted-foreground mt-1 text-xs">
                  Est. return <PointsAmount value={estimatePayout(s.pool, s.endingStake, p.stake)} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Total stake</dt>
        <dd className={cn('text-right', total > balance && 'text-danger')}>
          <PointsAmount value={total} unit />
        </dd>
        <dt className="text-muted-foreground">Balance</dt>
        <dd className="text-right">
          <PointsAmount value={balance} unit />
        </dd>
        <dt className="text-muted-foreground">Est. return if all hit</dt>
        <dd className="text-primary text-right">
          <PointsAmount value={estimatedReturn} unit />
        </dd>
      </dl>
      <p className="text-muted-foreground text-xs">Estimate — changes as others bet</p>
      <Button type="button" size="lg" className="w-full" disabled={disabled} onClick={confirm}>
        {pending ? 'Placing…' : 'Confirm bets'}
      </Button>
    </div>
  )
}
```

`src/components/bet-slip/slip-dock.tsx`:
```tsx
'use client'

import { Ticket } from 'lucide-react'

import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { slipTotal } from '@/lib/slip'

import { BetSlipPanel } from './bet-slip-panel'
import { useSlip } from './slip-provider'

/** Desktop (≥ 768px): the slip as a sticky right column. */
export function SlipColumn() {
  return (
    <aside aria-label="Bet slip" className="hidden md:block">
      <Card className="sticky top-20">
        <CardHeader>
          <CardTitle>Bet slip</CardTitle>
        </CardHeader>
        <CardContent>
          <BetSlipPanel />
        </CardContent>
      </Card>
    </aside>
  )
}

/** Phone (< 768px): a bar above the tab bar while the slip has picks; opens a bottom sheet. */
export function SlipBar() {
  const slip = useSlip()
  const count = slip.picks.length
  return (
    <>
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 md:hidden">
          <button
            type="button"
            aria-label={`Open bet slip (${count} ${count === 1 ? 'pick' : 'picks'})`}
            onClick={() => slip.setSheetOpen(true)}
            className="bg-primary text-primary-foreground flex h-12 w-full items-center justify-between rounded-xl px-4 font-semibold shadow-lg"
          >
            <span className="flex items-center gap-2">
              <Ticket aria-hidden className="size-4" />
              Bet slip · {count}
            </span>
            <PointsAmount value={slipTotal(slip.picks)} unit />
          </button>
        </div>
      )}
      <Sheet open={slip.sheetOpen} onOpenChange={slip.setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto md:hidden">
          <SheetHeader>
            <SheetTitle>Bet slip</SheetTitle>
            <SheetDescription>Review your picks, then confirm them all at once.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <BetSlipPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

`src/app/(player)/layout.tsx` — replace (the desktop grid gains the 320px slip column; `pb-36` clears the phone slip bar and the tab bar):
```tsx
import { SlipBar, SlipColumn } from '@/components/bet-slip/slip-dock'
import { SlipProvider } from '@/components/bet-slip/slip-provider'
import { PlayerHeader } from '@/components/shell/player-header'
import { PlayerBottomNav } from '@/components/shell/player-nav'
import { requireUser } from '@/server/session'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <SlipProvider userId={user.id} balance={user.balance}>
      <div className="min-h-dvh">
        <PlayerHeader balance={user.balance} isAdmin={user.role === 'ADMIN'} />
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-36 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-6 md:pb-10">
          <main className="min-w-0">{children}</main>
          <SlipColumn />
        </div>
        <SlipBar />
        <PlayerBottomNav />
      </div>
    </SlipProvider>
  )
}
```

- [ ] **Step 7: Manual check**

The old game page still uses the single-bet grid until Task 9. To exercise the slip now, put a pick into storage by hand.
1. Run `npm run dev -- -p 3005`, then log in as a funded player (grant points as admin via the old player page).
2. In the browser console on `/games`, run:
   `localStorage.setItem('lastdigit.slip.' + '<your user id>', JSON.stringify({ picks: [{ gameId: '<an open game id>', awayDigit: 9, homeDigit: 6, stake: 100, matchup: 'LAL @ GSW' }], lastStake: 100 }))`.
   Find the ids with `npx prisma studio` or the old admin pages.
3. Reload and check the following.
   - Desktop shows the "Bet slip" column with the pick, its estimate, Total, Balance and Est. return.
   - At 390px the green "Bet slip · 1" bar sits above the tab bar and opens the bottom sheet.
   - +10/+50/+100/Max change the stake, and clearing the input disables Confirm.
   - Confirm bets shows the toast "1 bet placed", empties the slip and updates the balance pill.
   - Writing `'{bad'` to the key and reloading shows an empty slip.

Stop the server.

- [ ] **Step 8: Commit**

Run `npm run check`, then:
```bash
git add src/lib/slip.ts src/components/bet-slip "src/app/(player)/actions.ts" "src/app/(player)/layout.tsx" tests/unit/slip.test.ts
git commit -m "feat: add all-or-nothing bet slip with saved picks"
```

---

### Task 9: Games feed and game screen — pickers, heatmap, estimate

**Files:**
- Create: `src/lib/game/heat.ts`, `src/components/empty-state.tsx`, `src/components/bet-result.tsx`, `src/components/games/{date-strip,game-card,game-header,digit-picker,ending-heatmap,ending-picker}.tsx`
- Modify: `src/lib/format.ts` (add `formatTipoffTime`), `src/lib/game/ending.ts` (add `winningEnding`), `src/app/(player)/games/page.tsx`, `src/app/(player)/games/[id]/page.tsx`, `src/app/(player)/actions.ts` (delete `placeBetAction`), `src/server/queries/player.ts` (delete `listUpcomingGames`), `tests/integration/player-queries.test.ts`
- Delete: `src/components/bet-grid.tsx`
- Test: `tests/unit/heat.test.ts`, `tests/unit/ending.test.ts` (append), `tests/unit/format.test.ts` (append)

**Interfaces:**
- Consumes:
  - from Task 2: `etDateStrip`, `parseStripDate`, `StripDay`;
  - from Task 5: `groupIntoSections`, `listGamesForDate`;
  - from Task 3: `getEndingStakes`, `estimatePayout`;
  - from Task 1: `displayStatus`, `isBettingOpen`, `StatusPill`, `TeamBadge`, `PointsAmount`, `Countdown`;
  - from Task 8: `useSlip().add` / `lastStake`.
- Produces:
  - `heatLevel(stake, maxStake): 0|1|2|3|4`, `maxCell(cells)`;
  - `winningEnding(game): Ending | null`, `formatTipoffTime(d): string` (`"7:30 PM ET"`);
  - `<EmptyState>`, `<BetResult result payout />` (`Won +90` / `Lost` / `Pending` / `Refunded`);
  - `<DateStrip days selected />`, `<GameCard game={GameCardData} now />`, `<GameHeader game winners now />`;
  - `<DigitPicker team value onChange disabled? />`;
  - `<EndingHeatmap awayTeam homeTeam cells selected? winning? onSelect? />`, which is read-only when `onSelect` is omitted (Task 14 reuses it in the game drawer);
  - `<EndingPicker gameId awayTeam homeTeam open pool cells />`.
- E2E contract:
  - pickers `<TEAM> digit <d>` (e.g. `LAL digit 9`) inside groups labelled `<TEAM> last digit`;
  - the button `Add to slip`;
  - heatmap cells named `Ending 9-6, 1,200 staked`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/heat.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { heatLevel, maxCell } from '@/lib/game/heat'

describe('heatLevel', () => {
  it('maps stakes to 5 shades relative to the busiest ending', () => {
    expect(heatLevel(0, 1000)).toBe(0)
    expect(heatLevel(1, 1000)).toBe(1)
    expect(heatLevel(250, 1000)).toBe(1)
    expect(heatLevel(251, 1000)).toBe(2)
    expect(heatLevel(500, 1000)).toBe(2)
    expect(heatLevel(750, 1000)).toBe(3)
    expect(heatLevel(751, 1000)).toBe(4)
    expect(heatLevel(1000, 1000)).toBe(4)
  })

  it('handles empty pools', () => {
    expect(heatLevel(0, 0)).toBe(0)
    expect(maxCell([])).toBe(0)
    expect(
      maxCell([
        [0, 3],
        [7, 1],
      ]),
    ).toBe(7)
  })
})
```

Append to `tests/unit/ending.test.ts` (and change its import to `import { endingOf, formatEnding, winningEnding } from '@/lib/game/ending'`):
```ts

describe('winningEnding', () => {
  it('is known once FINAL or SETTLED with scores', () => {
    expect(winningEnding({ status: 'FINAL', awayScore: 99, homeScore: 106 })).toEqual({
      awayDigit: 9,
      homeDigit: 6,
    })
    expect(winningEnding({ status: 'SETTLED', awayScore: 100, homeScore: 91 })).toEqual({
      awayDigit: 0,
      homeDigit: 1,
    })
  })

  it('is null while live, void or without scores', () => {
    expect(winningEnding({ status: 'LIVE', awayScore: 50, homeScore: 48 })).toBeNull()
    expect(winningEnding({ status: 'VOID', awayScore: 99, homeScore: 106 })).toBeNull()
    expect(winningEnding({ status: 'FINAL', awayScore: null, homeScore: 106 })).toBeNull()
  })
})
```

In `tests/unit/format.test.ts`, add `formatTipoffTime` to the import and add inside the `describe`:
```ts
  it('formats ET tip-off times', () => {
    expect(formatTipoffTime(new Date('2026-11-12T00:30:00Z'))).toBe('7:30 PM ET')
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/heat.test.ts tests/unit/ending.test.ts tests/unit/format.test.ts`
Expected: FAIL — `Cannot find module '@/lib/game/heat'`; `winningEnding` and `formatTipoffTime` are not functions.

- [ ] **Step 3: Implement the helpers**

`src/lib/game/heat.ts`:
```ts
/** Heatmap shade 0–4 for a cell: 0 = nothing staked, 4 = the most-staked ending (spec §4.2: 5 steps). */
export function heatLevel(stake: number, maxStake: number): 0 | 1 | 2 | 3 | 4 {
  if (stake <= 0 || maxStake <= 0) return 0
  const level = Math.ceil((Math.min(stake, maxStake) / maxStake) * 4)
  return level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4
}

export function maxCell(cells: number[][]): number {
  return cells.reduce((max, row) => row.reduce((m, v) => Math.max(m, v), max), 0)
}
```

`src/lib/game/ending.ts` — replace:
```ts
import type { GameStatus } from '@prisma/client'

export type Ending = { awayDigit: number; homeDigit: number }

export function endingOf(awayScore: number, homeScore: number): Ending {
  for (const s of [awayScore, homeScore]) {
    if (!Number.isInteger(s) || s < 0) throw new Error(`Invalid score: ${s}`)
  }
  return { awayDigit: awayScore % 10, homeDigit: homeScore % 10 }
}

export function formatEnding(e: Ending): string {
  return `${e.awayDigit}-${e.homeDigit}`
}

/** The winning ending once a game is FINAL or SETTLED with scores, else null. */
export function winningEnding(game: {
  status: GameStatus
  awayScore: number | null
  homeScore: number | null
}): Ending | null {
  const done = game.status === 'FINAL' || game.status === 'SETTLED'
  return done && game.awayScore !== null && game.homeScore !== null
    ? endingOf(game.awayScore, game.homeScore)
    : null
}
```

Append to `src/lib/format.ts`:
```ts

/** "7:30 PM ET" */
export function formatTipoffTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }) + ' ET'
}
```

Run: `npx vitest run tests/unit/heat.test.ts tests/unit/ending.test.ts tests/unit/format.test.ts`
Expected: PASS.

- [ ] **Step 4: Components**

`src/components/empty-state.tsx`:
```tsx
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground bg-card border-border rounded-xl border p-8 text-center">
      {children}
    </p>
  )
}
```

`src/components/bet-result.tsx`:
```tsx
import type { BetResult as Result } from '@prisma/client'

import { formatPoints } from '@/lib/format'
import { cn } from '@/lib/utils'

/** "+225" in accent for wins; muted for losses; plain for pending/refunded (spec §4.4). */
export function BetResult({ result, payout }: { result: Result; payout: number }) {
  return (
    <span
      className={cn(
        'num text-sm',
        result === 'WON' && 'text-primary font-semibold',
        result === 'LOST' && 'text-muted-foreground',
      )}
    >
      {result === 'WON'
        ? `Won +${formatPoints(payout)}`
        : result === 'LOST'
          ? 'Lost'
          : result === 'PENDING'
            ? 'Pending'
            : 'Refunded'}
    </span>
  )
}
```

`src/components/games/date-strip.tsx`:
```tsx
import Link from 'next/link'

import type { StripDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function DateStrip({ days, selected }: { days: StripDay[]; selected: string }) {
  return (
    <nav aria-label="Game day" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 pb-1">
        {days.map((d) => {
          const active = d.date === selected
          return (
            <li key={d.date}>
              <Link
                href={`/games?date=${d.date}`}
                aria-current={active ? 'date' : undefined}
                className={cn(
                  'block rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                )}
              >
                {d.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

`src/components/games/game-card.tsx` — the whole card is one link; the score replaces the tip-off time when LIVE/FINAL/SETTLED:
```tsx
import type { GameStatus } from '@prisma/client'
import Link from 'next/link'

import { Countdown } from '@/components/countdown'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { TeamBadge } from '@/components/team-badge'
import { formatTipoffTime } from '@/lib/format'
import { displayStatus, isBettingOpen } from '@/lib/game/status'

export type GameCardData = {
  id: string
  awayTeam: string
  homeTeam: string
  startsAt: Date
  status: GameStatus
  awayScore: number | null
  homeScore: number | null
  pool: number
  myPickCount: number
}

const SHOWS_SCORE: GameStatus[] = ['LIVE', 'FINAL', 'SETTLED']

export function GameCard({ game, now }: { game: GameCardData; now: Date }) {
  const open = isBettingOpen(game, now)
  const showScore = SHOWS_SCORE.includes(game.status) && game.awayScore !== null && game.homeScore !== null
  return (
    <Link
      href={`/games/${game.id}`}
      className="bg-card border-border hover:border-primary/50 block rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={displayStatus(game, now)} />
        {game.myPickCount > 0 && (
          <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
            {game.myPickCount} {game.myPickCount === 1 ? 'pick' : 'picks'}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <TeamBadge abbr={game.awayTeam} />
        <span className="font-semibold">
          {game.awayTeam} <span className="text-muted-foreground">@</span> {game.homeTeam}
        </span>
        <TeamBadge abbr={game.homeTeam} />
        <span className="num ml-auto text-sm">
          {showScore ? `${game.awayScore}–${game.homeScore}` : formatTipoffTime(game.startsAt)}
        </span>
      </div>
      <div className="text-muted-foreground mt-3 flex items-center justify-between text-sm">
        <span>
          Pool <PointsAmount value={game.pool} className="text-foreground" />
        </span>
        {open && <Countdown to={game.startsAt.toISOString()} />}
      </div>
    </Link>
  )
}
```

`src/components/games/game-header.tsx`:
```tsx
import type { GameStatus } from '@prisma/client'

import { Countdown } from '@/components/countdown'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { TeamBadge } from '@/components/team-badge'
import { formatTipoff } from '@/lib/format'
import { formatEnding, winningEnding } from '@/lib/game/ending'
import { displayStatus, isBettingOpen } from '@/lib/game/status'

export type GameHeaderData = {
  awayTeam: string
  homeTeam: string
  startsAt: Date
  status: GameStatus
  awayScore: number | null
  homeScore: number | null
  pool: number
  voidReason: string | null
}

export function GameHeader({ game, winners, now }: { game: GameHeaderData; winners: number; now: Date }) {
  const showScore =
    (game.status === 'LIVE' || game.status === 'FINAL' || game.status === 'SETTLED') &&
    game.awayScore !== null &&
    game.homeScore !== null
  const winning = winningEnding(game)
  return (
    <header className="bg-card border-border rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={displayStatus(game, now)} />
        <span className="text-muted-foreground text-xs">{formatTipoff(game.startsAt)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <TeamBadge abbr={game.awayTeam} size="lg" />
          <span className="text-muted-foreground text-xs">Away</span>
        </div>
        <h1 className="num text-center text-2xl font-bold">
          {showScore ? (
            `${game.awayScore} – ${game.homeScore}`
          ) : (
            <>
              {game.awayTeam} <span className="text-muted-foreground">@</span> {game.homeTeam}
            </>
          )}
        </h1>
        <div className="flex flex-col items-center gap-1">
          <TeamBadge abbr={game.homeTeam} size="lg" />
          <span className="text-muted-foreground text-xs">Home</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Pool <PointsAmount value={game.pool} unit className="text-foreground" />
        </span>
        {isBettingOpen(game, now) && (
          <span className="text-muted-foreground">
            Closes in <Countdown to={game.startsAt.toISOString()} />
          </span>
        )}
      </div>
      {winning && (
        <p className="mt-2 text-sm">
          Winning ending <strong className="num text-primary">{formatEnding(winning)}</strong>
          {game.status === 'SETTLED' && ` · ${winners} winning ${winners === 1 ? 'bet' : 'bets'}`}
        </p>
      )}
      {game.status === 'VOID' && (
        <p className="text-danger mt-2 text-sm">Void: {game.voidReason}. Stakes were refunded.</p>
      )}
    </header>
  )
}
```

`src/components/games/digit-picker.tsx`:
```tsx
import { cn } from '@/lib/utils'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

type Props = {
  team: string
  value: number | null
  onChange: (digit: number) => void
  disabled?: boolean
}

/** One row of large 0–9 buttons for a team's last digit; each is labelled e.g. "LAL digit 9". */
export function DigitPicker({ team, value, onChange, disabled }: Props) {
  return (
    <div role="group" aria-label={`${team} last digit`}>
      <div className="text-muted-foreground mb-1.5 text-xs font-medium">{team} last digit</div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            aria-label={`${team} digit ${d}`}
            aria-pressed={value === d}
            disabled={disabled}
            onClick={() => onChange(d)}
            className={cn(
              'num h-12 rounded-lg border text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              value === d
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface-2 hover:border-primary/60',
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
```

`src/components/games/ending-heatmap.tsx`:
```tsx
import { formatPoints } from '@/lib/format'
import { heatLevel, maxCell } from '@/lib/game/heat'
import { cn } from '@/lib/utils'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const SHADES = [
  'bg-surface-2 text-muted-foreground',
  'bg-primary/15 text-foreground',
  'bg-primary/35 text-foreground',
  'bg-primary/60 text-primary-foreground',
  'bg-primary text-primary-foreground',
] as const

type Props = {
  awayTeam: string
  homeTeam: string
  /** cells[awayDigit][homeDigit] = points staked. */
  cells: number[][]
  selected?: { awayDigit: number; homeDigit: number } | null
  winning?: { awayDigit: number; homeDigit: number } | null
  /** Omit for a read-only map (admin drawer, closed games). */
  onSelect?: (awayDigit: number, homeDigit: number) => void
}

/** 10×10 pool map: rows = away digit, columns = home digit, 5 shades by stake (spec §4.2). */
export function EndingHeatmap({ awayTeam, homeTeam, cells, selected, winning, onSelect }: Props) {
  const max = maxCell(cells)
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <caption className="text-muted-foreground mb-1 text-left text-xs">
          Rows: {awayTeam} last digit · Columns: {homeTeam} last digit
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              {awayTeam} digit
            </th>
            {DIGITS.map((h) => (
              <th key={h} scope="col" className="num text-muted-foreground w-8 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIGITS.map((a) => (
            <tr key={a}>
              <th scope="row" className="num text-muted-foreground pr-1 font-normal">
                {a}
              </th>
              {DIGITS.map((h) => {
                const stake = cells[a]?.[h] ?? 0
                const label = `Ending ${a}-${h}, ${formatPoints(stake)} staked`
                const isSelected = selected?.awayDigit === a && selected.homeDigit === h
                const isWinning = winning?.awayDigit === a && winning.homeDigit === h
                const className = cn(
                  'num flex size-8 items-center justify-center rounded-md',
                  SHADES[heatLevel(stake, max)],
                  isSelected && 'ring-foreground ring-2',
                  isWinning && 'ring-live ring-2',
                )
                return (
                  <td key={h} className="p-0">
                    {onSelect ? (
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={isSelected}
                        onClick={() => onSelect(a, h)}
                        className={className}
                      >
                        {stake > 0 ? compact(stake) : ''}
                      </button>
                    ) : (
                      <span role="img" aria-label={label} className={className}>
                        {stake > 0 ? compact(stake) : ''}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function compact(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n)
}
```

`src/components/games/ending-picker.tsx`.
- Pickers are the default; a heatmap cell selects both digits.
- When betting is closed, the pickers and the button are disabled, but the heatmap stays readable (`onSelect` is omitted).
```tsx
'use client'

import { useState } from 'react'

import { useSlip } from '@/components/bet-slip/slip-provider'
import { PointsAmount } from '@/components/points-amount'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { estimatePayout } from '@/lib/game/payout'

import { DigitPicker } from './digit-picker'
import { EndingHeatmap } from './ending-heatmap'

type Props = {
  gameId: string
  awayTeam: string
  homeTeam: string
  open: boolean
  pool: number
  cells: number[][]
}

/** Pickers / Heatmap toggle, the selected-ending panel and Add to slip (spec §4.2). */
export function EndingPicker({ gameId, awayTeam, homeTeam, open, pool, cells }: Props) {
  const slip = useSlip()
  const [away, setAway] = useState<number | null>(null)
  const [home, setHome] = useState<number | null>(null)
  const selected = away !== null && home !== null ? { awayDigit: away, homeDigit: home } : null
  const endingStake = selected ? (cells[selected.awayDigit]?.[selected.homeDigit] ?? 0) : 0

  return (
    <div className="space-y-4">
      <Tabs defaultValue="pickers">
        <TabsList aria-label="Pick mode">
          <TabsTrigger value="pickers">Pickers</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
        </TabsList>
        <TabsContent value="pickers" className="space-y-4 pt-3">
          <DigitPicker team={awayTeam} value={away} onChange={setAway} disabled={!open} />
          <DigitPicker team={homeTeam} value={home} onChange={setHome} disabled={!open} />
        </TabsContent>
        <TabsContent value="heatmap" className="pt-3">
          <EndingHeatmap
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            cells={cells}
            selected={selected}
            onSelect={
              open
                ? (a, h) => {
                    setAway(a)
                    setHome(h)
                  }
                : undefined
            }
          />
        </TabsContent>
      </Tabs>

      <div className="bg-surface-2 border-border rounded-lg border p-3" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-xs">Selected ending</span>
          <span className="num text-primary text-2xl font-bold">
            {selected ? `${selected.awayDigit}-${selected.homeDigit}` : '–'}
          </span>
        </div>
        {selected && (
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Staked on this ending</dt>
            <dd className="text-right">
              <PointsAmount value={endingStake} unit />
            </dd>
            <dt className="text-muted-foreground">Est. payout per 100 staked</dt>
            <dd className="text-primary text-right">
              <PointsAmount value={estimatePayout(pool, endingStake, 100)} unit />
            </dd>
          </dl>
        )}
        <p className="text-muted-foreground mt-2 text-xs">Estimate — changes as others bet</p>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!open || !selected}
        onClick={() => {
          if (selected) slip.add({ gameId, ...selected, matchup: `${awayTeam} @ ${homeTeam}` })
        }}
      >
        {open ? 'Add to slip' : 'Betting closed'}
      </Button>
      {open && (
        <p className="text-muted-foreground text-center text-xs">
          Adds at your last stake: <PointsAmount value={slip.lastStake} unit />
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Pages**

`src/app/(player)/games/page.tsx` — replace:
```tsx
import { EmptyState } from '@/components/empty-state'
import { DateStrip } from '@/components/games/date-strip'
import { GameCard } from '@/components/games/game-card'
import { etDateStrip, parseStripDate } from '@/lib/dates'
import { groupIntoSections } from '@/lib/game/sections'
import type { SearchParams } from '@/lib/table-params'
import { listGamesForDate } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function GamesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  const now = new Date()
  const date = parseStripDate((await searchParams).date, now)
  const sections = groupIntoSections(await listGamesForDate(date, user.id), now)
  return (
    <div className="space-y-5">
      <h1 className="sr-only">Games</h1>
      <DateStrip days={etDateStrip(now)} selected={date} />
      {sections.length === 0 ? (
        <EmptyState>No games on this day</EmptyState>
      ) : (
        sections.map((s) => (
          <section key={s.key} aria-labelledby={`section-${s.key}`} className="space-y-2">
            <h2 id={`section-${s.key}`} className="text-muted-foreground text-xs font-semibold uppercase">
              {s.title}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {s.games.map((g) => (
                <li key={g.id}>
                  <GameCard game={g} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
```

`src/app/(player)/games/[id]/page.tsx` — replace:
```tsx
import { notFound } from 'next/navigation'

import { BetResult } from '@/components/bet-result'
import { EndingPicker } from '@/components/games/ending-picker'
import { GameHeader } from '@/components/games/game-header'
import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatEnding } from '@/lib/game/ending'
import { isBettingOpen } from '@/lib/game/status'
import { getGameForPlayer } from '@/server/queries/player'
import { getEndingStakes } from '@/server/queries/stakes'
import { requireUser } from '@/server/session'

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const data = await getGameForPlayer(id, user.id)
  if (!data) notFound()
  const { game, myBets, winners } = data
  const stakes = await getEndingStakes(game.id)
  const now = new Date()

  return (
    <div className="space-y-4">
      <GameHeader game={game} winners={winners} now={now} />
      <Card>
        <CardHeader>
          <CardTitle>Pick an ending</CardTitle>
        </CardHeader>
        <CardContent>
          <EndingPicker
            gameId={game.id}
            awayTeam={game.awayTeam}
            homeTeam={game.homeTeam}
            open={isBettingOpen(game, now)}
            pool={stakes.pool}
            cells={stakes.cells}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My bets on this game</CardTitle>
        </CardHeader>
        <CardContent>
          {myBets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bets yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {myBets.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="num text-base font-semibold">{formatEnding(b)}</span>
                  <PointsAmount value={b.stake} unit className="text-muted-foreground" />
                  <BetResult result={b.result} payout={b.payout} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Remove the old single-bet flow**

- Delete `src/components/bet-grid.tsx`.
- In `src/app/(player)/actions.ts`:
  - delete the whole `placeBetAction` function;
  - change the import to `import { placeBets } from '@/server/bets'`.
- In `src/server/queries/player.ts`, delete `listUpcomingGames` (and its doc comment).
- In `tests/integration/player-queries.test.ts`:
  - delete the test `'lists games from the last 36 hours onward, soonest first'`;
  - change the import to `import { getGameForPlayer } from '@/server/queries/player'`.

- [ ] **Step 7: Manual check**

Run `npm run dev -- -p 3005` as a funded player (create games with `npx prisma studio` if the dev DB has none for today: `externalId` any unused int, `startsAt` later today, status `SCHEDULED`). Check the following.
- `/games` shows the date strip with Yesterday/Today/… and Today selected.
- `?date=2026-02-30` and `?date=junk` fall back to Today.
- Sections appear in the order Live / Open for bets / Upcoming / closed / Final, and empty ones are hidden. An empty day shows "No games on this day".
- Cards show the team badges, tip-off time (ET), pool, status pill, countdown and the "N picks" chip.
- On `/games/<id>`, tapping `LAL digit 9` and `GSW digit 6` shows ending `9-6`, the stake on it and "Est. payout per 100 staked".
- The Heatmap tab shades cells, and tapping a cell syncs the selection.
- Add to slip puts the pick in the slip; Confirm places it and the pool and heatmap update.
- On a LIVE or past game, the pickers and button are disabled while the heatmap is still visible.

Stop the server.

- [ ] **Step 8: Commit**

Run `npm run check`, then:
```bash
git add src/lib/game/heat.ts src/lib/game/ending.ts src/lib/format.ts src/components "src/app/(player)" src/server/queries/player.ts tests/unit/heat.test.ts tests/unit/ending.test.ts tests/unit/format.test.ts tests/integration/player-queries.test.ts
git commit -m "feat: add games feed with date strip and ending pickers with pool heatmap"
```

---

### Task 10: My Bets, Wallet, More (referral, support, account) and player redirects

**Files:**
- Create: `src/components/pagination.tsx`, `src/components/filter-chips.tsx`, `src/components/tx-icon.tsx`, `src/components/support/chat-thread.tsx`, `src/components/more/copy-share.tsx`, `src/app/(player)/more/referral/page.tsx`, `src/app/(player)/more/support/page.tsx`, `src/app/(player)/more/support/[id]/page.tsx`
- Modify: `src/lib/format.ts` (add `formatEtDay`), `src/app/(player)/bets/page.tsx`, `src/app/(player)/wallet/page.tsx`, `src/app/(player)/more/page.tsx`, `src/app/(player)/actions.ts` (support paths), `src/server/queries/player.ts` (delete `listMyBets`), `next.config.ts`, `tests/unit/admin-page-guards.test.ts`
- Delete: `src/app/(player)/referral/page.tsx`, `src/app/(player)/inquiries/page.tsx`, `src/app/(player)/inquiries/[id]/page.tsx`
- Test: `tests/unit/redirects.test.ts`, `tests/unit/format.test.ts` (append)

**Interfaces:**
- Consumes:
  - from Task 5: `listMyBetsGrouped`, `listMyTransactions`, `parseBetTab`, `BET_TABS`, `BET_TAB_LABELS`, `parseWalletFilter`, `WALLET_FILTERS`, `WALLET_FILTER_LABELS`, `TX_TYPE_LABELS`, `parsePage`;
  - from Task 6: `hrefWith`, `SearchParams`;
  - from Task 2: `etDateOf`;
  - existing: `listInquiriesForUser`, `getInquiryThread`, `listMyReferrals`, `getReferralBonus`.
- Produces:
  - `<Pagination basePath params page pageCount />`, which renders nothing when `pageCount <= 1`;
  - `<FilterChips label chips={{label, href, active, count?}[]} />`, `<TxIcon type />`;
  - `<ChatThread messages viewer="PLAYER"|"ADMIN" />`: the viewer's side on the right, the other side on the left, with the admin shown as "Support";
  - `<CopyShare code link />`;
  - `formatEtDay(etDate)` (`"Wed, Nov 11"`).
- Routes:
  - `/bets?tab=open|settled|refunded&page=`, `/wallet?type=<filter>&page=`;
  - `/more`, `/more/referral`, `/more/support`, `/more/support/[id]`;
  - redirects `/referral` → `/more/referral`, `/inquiries` → `/more/support`, `/inquiries/:id` → `/more/support/:id`, all permanent.
- E2E contract:
  - `data-testid="referral-code"`;
  - `data-testid="balance"` text `<n> pts`;
  - wallet rows show the type label in its own element (`Payout`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/redirects.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'

describe('permanent redirects for moved pages', () => {
  it('maps every old URL to its new home', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    expect(redirects.map(({ source, destination, permanent }) => [source, destination, permanent])).toEqual([
      ['/referral', '/more/referral', true],
      ['/inquiries', '/more/support', true],
      ['/inquiries/:id', '/more/support/:id', true],
    ])
  })
})
```

In `tests/unit/format.test.ts`, add `formatEtDay` to the import and add inside the `describe`:
```ts
  it('formats ET days', () => {
    expect(formatEtDay('2026-11-11')).toBe('Wed, Nov 11')
  })
```

In `tests/unit/admin-page-guards.test.ts`, replace the three player entries for `(player)/inquiries`, `(player)/inquiries/[id]` and `(player)/referral` with:
```ts
  ['(player)/more/referral', () => import('@/app/(player)/more/referral/page'), sp()],
  ['(player)/more/support', () => import('@/app/(player)/more/support/page'), sp()],
  ['(player)/more/support/[id]', () => import('@/app/(player)/more/support/[id]/page'), params({ id: 'x' })],
```
(keep them in alphabetical order after `(player)/more`).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/redirects.test.ts tests/unit/format.test.ts tests/unit/admin-page-guards.test.ts`
Expected: FAIL — `nextConfig.redirects` is undefined (the list is `[]`), `formatEtDay is not a function`, and the new page modules are missing.

- [ ] **Step 3: Shared components and helpers**

Append to `src/lib/format.ts`:
```ts

/** 'YYYY-MM-DD' (an ET date) → "Wed, Nov 11" */
export function formatEtDay(etDate: string): string {
  return new Date(`${etDate}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
```

`src/components/pagination.tsx`:
```tsx
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import type { SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { cn } from '@/lib/utils'

type Props = { basePath: string; params: SearchParams; page: number; pageCount: number }

export function Pagination({ basePath, params, page, pageCount }: Props) {
  if (pageCount <= 1) return null
  const link = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link
        href={hrefWith(basePath, params, { page: target })}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        {label}
      </Link>
    ) : (
      <span aria-disabled className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'opacity-40')}>
        {label}
      </span>
    )
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-3 text-sm">
      {link(page - 1, 'Previous', page > 1)}
      <span className="text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      {link(page + 1, 'Next', page < pageCount)}
    </nav>
  )
}
```

`src/components/filter-chips.tsx`:
```tsx
import Link from 'next/link'

import { cn } from '@/lib/utils'

export type Chip = { label: string; href: string; active: boolean; count?: number }

/** A row of link chips (tabs and filters driven by search params). */
export function FilterChips({ label, chips }: { label: string; chips: Chip[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 pb-1">
        {chips.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              aria-current={c.active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap',
                c.active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
              {c.count !== undefined && <span className="num text-xs">{c.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

`src/components/tx-icon.tsx`:
```tsx
import type { TransactionType } from '@prisma/client'
import { Gift, ShieldMinus, ShieldPlus, Ticket, Trophy, Undo2 } from 'lucide-react'

const ICONS = {
  BET: Ticket,
  PAYOUT: Trophy,
  REFERRAL_BONUS: Gift,
  ADMIN_GRANT: ShieldPlus,
  ADMIN_DEDUCT: ShieldMinus,
  REFUND: Undo2,
} satisfies Record<TransactionType, unknown>

export function TxIcon({ type }: { type: TransactionType }) {
  const Icon = ICONS[type]
  return (
    <span className="bg-surface-2 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
      <Icon aria-hidden className="size-4" />
    </span>
  )
}
```

`src/components/support/chat-thread.tsx`:
```tsx
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  body: string
  createdAt: Date
  author: { username: string; role: 'PLAYER' | 'ADMIN' }
}

/** Ticket thread as chat bubbles: the viewer's side on the right, the other side on the left (spec §4.6). */
export function ChatThread({ messages, viewer }: { messages: Message[]; viewer: 'PLAYER' | 'ADMIN' }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => {
        const mine = m.author.role === viewer
        return (
          <li key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-surface-2 rounded-bl-sm',
              )}
            >
              {m.body}
            </div>
            <div className="text-muted-foreground mt-1 text-[11px]">
              {m.author.role === 'ADMIN' ? 'Support' : m.author.username} · {formatDateTime(m.createdAt)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```

`src/components/more/copy-share.tsx`:
```tsx
'use client'

import { Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch (e) {
    console.error('copy failed', e)
    toast.error('Could not copy — select the text and copy it manually')
  }
}

/** Copy the code; Share the signup link via navigator.share when available, else copy it (spec §4.6). */
export function CopyShare({ code, link }: { code: string; link: string }) {
  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Join me on LastDigit', url: link })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return // user closed the share sheet
        console.error('share failed', e)
      }
    }
    await copy(link, 'Invite link')
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={() => copy(code, 'Code')}>
        <Copy aria-hidden /> Copy
      </Button>
      <Button type="button" onClick={share}>
        <Share2 aria-hidden /> Share
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Pages**

`src/app/(player)/bets/page.tsx` — replace:
```tsx
import Link from 'next/link'

import { BetResult } from '@/components/bet-result'
import { EmptyState } from '@/components/empty-state'
import { FilterChips } from '@/components/filter-chips'
import { Pagination } from '@/components/pagination'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { TeamBadge } from '@/components/team-badge'
import { formatTipoff } from '@/lib/format'
import { formatEnding } from '@/lib/game/ending'
import { displayStatus } from '@/lib/game/status'
import { BET_TAB_LABELS, BET_TABS, type BetTab, parseBetTab } from '@/lib/my-bets'
import { parsePage } from '@/lib/pagination'
import type { SearchParams } from '@/lib/table-params'
import { listMyBetsGrouped } from '@/server/queries/player'
import { requireUser } from '@/server/session'

const EMPTY: Record<BetTab, string> = {
  open: 'No open bets.',
  settled: 'No settled bets yet.',
  refunded: 'No refunded bets.',
}

export default async function MyBetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  const sp = await searchParams
  const tab = parseBetTab(sp.tab)
  const page = parsePage(sp.page)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My bets</h1>
      <FilterChips
        label="Bet status"
        chips={BET_TABS.map((t) => ({ label: BET_TAB_LABELS[t], href: `/bets?tab=${t}`, active: t === tab }))}
      />
      <BetGroups userId={user.id} tab={tab} page={page} />
    </div>
  )
}

async function BetGroups({ userId, tab, page }: { userId: string; tab: BetTab; page: number }) {
  const result = await listMyBetsGrouped(userId, tab, page)
  const now = new Date()
  if (result.rows.length === 0) return <EmptyState>{EMPTY[tab]}</EmptyState>
  return (
    <>
      <ul className="space-y-3">
        {result.rows.map(({ game, bets }) => (
          <li key={game.id} className="bg-card border-border rounded-xl border">
            <Link
              href={`/games/${game.id}`}
              className="border-border hover:bg-surface-2 flex items-center gap-3 rounded-t-xl border-b p-3"
            >
              <TeamBadge abbr={game.awayTeam} size="sm" />
              <span className="font-semibold">
                {game.awayTeam} @ {game.homeTeam}
              </span>
              <TeamBadge abbr={game.homeTeam} size="sm" />
              <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
                {formatTipoff(game.startsAt)}
              </span>
              <StatusPill status={displayStatus(game, now)} />
            </Link>
            <ul className="divide-border divide-y px-3">
              {bets.map((b) => (
                <li key={b.id} className="grid grid-cols-3 items-center gap-2 py-2 text-sm">
                  <span className="num font-semibold">{formatEnding(b)}</span>
                  <PointsAmount value={b.stake} unit className="text-muted-foreground" />
                  <span className="text-right">
                    <BetResult result={b.result} payout={b.payout} />
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <Pagination basePath="/bets" params={{ tab }} page={result.page} pageCount={result.pageCount} />
    </>
  )
}
```

`src/app/(player)/wallet/page.tsx` — replace:
```tsx
import { EmptyState } from '@/components/empty-state'
import { FilterChips } from '@/components/filter-chips'
import { Pagination } from '@/components/pagination'
import { PointsAmount } from '@/components/points-amount'
import { TxIcon } from '@/components/tx-icon'
import { etDateOf } from '@/lib/dates'
import { formatEtDay, formatTipoffTime } from '@/lib/format'
import { parsePage } from '@/lib/pagination'
import type { SearchParams } from '@/lib/table-params'
import {
  parseWalletFilter,
  TX_TYPE_LABELS,
  WALLET_FILTER_LABELS,
  WALLET_FILTERS,
  type WalletFilter,
} from '@/lib/wallet'
import { listMyTransactions } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function WalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  const sp = await searchParams
  const filter = parseWalletFilter(sp.type)
  const page = parsePage(sp.page)
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Wallet</h1>
      <section className="from-primary/20 to-card border-border rounded-xl border bg-gradient-to-br p-5">
        <div className="text-muted-foreground text-sm">Balance</div>
        <div className="mt-1 text-4xl font-bold" data-testid="balance">
          <PointsAmount value={user.balance} unit />
        </div>
      </section>
      <FilterChips
        label="Transaction type"
        chips={WALLET_FILTERS.map((f) => ({
          label: WALLET_FILTER_LABELS[f],
          href: f === 'all' ? '/wallet' : `/wallet?type=${f}`,
          active: f === filter,
        }))}
      />
      <TransactionDays userId={user.id} filter={filter} page={page} />
    </div>
  )
}

async function TransactionDays({
  userId,
  filter,
  page,
}: {
  userId: string
  filter: WalletFilter
  page: number
}) {
  const result = await listMyTransactions(userId, filter, page)
  if (result.rows.length === 0) return <EmptyState>No transactions yet.</EmptyState>

  // Rows come newest first; group them by ET calendar day.
  const days: { date: string; rows: typeof result.rows }[] = []
  for (const t of result.rows) {
    const date = etDateOf(t.createdAt)
    const last = days.at(-1)
    if (last?.date === date) last.rows.push(t)
    else days.push({ date, rows: [t] })
  }

  return (
    <>
      {days.map((day) => (
        <section key={day.date} aria-label={formatEtDay(day.date)}>
          <h2 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
            {formatEtDay(day.date)}
          </h2>
          <ul className="bg-card border-border divide-border divide-y rounded-xl border">
            {day.rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-3">
                <TxIcon type={t.type} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{TX_TYPE_LABELS[t.type]}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {t.game ? `${t.game.awayTeam} @ ${t.game.homeTeam}` : (t.note ?? '')} ·{' '}
                    {formatTipoffTime(t.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <PointsAmount value={t.amount} signed className="block font-semibold" />
                  <span className="text-muted-foreground text-xs">
                    <PointsAmount value={t.balanceAfter} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Pagination
        basePath="/wallet"
        params={filter === 'all' ? {} : { type: filter }}
        page={result.page}
        pageCount={result.pageCount}
      />
    </>
  )
}
```

`src/app/(player)/more/page.tsx` — replace:
```tsx
import { ChevronRight, Gift, LifeBuoy } from 'lucide-react'
import Link from 'next/link'

import { LogoutButton } from '@/components/logout-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/server/session'

const LINKS = [
  { href: '/more/referral', label: 'Refer friends', icon: Gift },
  { href: '/more/support', label: 'Support', icon: LifeBuoy },
]

export default async function MorePage() {
  const user = await requireUser()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">More</h1>
      <ul className="bg-card border-border divide-border divide-y rounded-xl border">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:bg-surface-2 flex items-center gap-3 p-4">
              <l.icon aria-hidden className="text-primary size-5" />
              <span className="font-medium">{l.label}</span>
              <ChevronRight aria-hidden className="text-muted-foreground ml-auto size-4" />
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="text-muted-foreground text-xs">Signed in as</div>
            <div className="font-semibold">{user.username}</div>
          </div>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  )
}
```

`src/app/(player)/more/referral/page.tsx`:
```tsx
import { headers } from 'next/headers'

import { CopyShare } from '@/components/more/copy-share'
import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import { listMyReferrals } from '@/server/queries/player'
import { requireUser } from '@/server/session'
import { getReferralBonus } from '@/server/settings'

export default async function ReferralPage() {
  const user = await requireUser()
  const [referrals, bonus, h] = await Promise.all([listMyReferrals(user.id), getReferralBonus(), headers()])
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const link = `${origin}/signup?ref=${user.referralCode}`
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Refer friends</h1>
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Earn <PointsAmount value={bonus} unit className="text-primary font-semibold" /> for each friend
            who signs up with your code.
          </p>
          <div className="bg-surface-2 border-border rounded-lg border p-3 text-center">
            <div className="text-muted-foreground text-xs">Your code</div>
            <strong className="num text-primary text-2xl tracking-widest" data-testid="referral-code">
              {user.referralCode}
            </strong>
          </div>
          <CopyShare code={user.referralCode} link={link} />
          <p className="text-muted-foreground text-xs break-all">{link}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Players you referred ({referrals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody yet — share your link.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {referrals.map((r) => (
                <li key={r.username} className="flex justify-between py-2">
                  <span>{r.username}</span>
                  <span className="text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

`src/app/(player)/more/support/page.tsx`:
```tsx
import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/format'
import { listInquiriesForUser } from '@/server/inquiries'
import { requireUser } from '@/server/session'

import { createInquiryAction } from '../../actions'

export default async function SupportPage() {
  const user = await requireUser()
  const tickets = await listInquiriesForUser(user.id)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Support</h1>
      <Card>
        <CardHeader>
          <CardTitle>My tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tickets yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/more/support/${t.id}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1 font-medium">{t.subject}</span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(t.updatedAt)}</span>
                    <span className="bg-surface-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      {t.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createInquiryAction} submitLabel="Send" className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" maxLength={120} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" name="body" rows={5} maxLength={5000} required />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  )
}
```

`src/app/(player)/more/support/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'

import { ActionForm } from '@/components/action-form'
import { ChatThread } from '@/components/support/chat-thread'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DomainError } from '@/lib/errors'
import { getInquiryThread } from '@/server/inquiries'
import { requireUser } from '@/server/session'

import { closeInquiryAction, replyInquiryAction } from '../../../actions'

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const thread = await getInquiryThread(user.id, id).catch((e: unknown) => {
    if (e instanceof DomainError) notFound()
    throw e
  })
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{thread.subject}</h1>
        <span className="bg-surface-2 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {thread.status}
        </span>
      </div>
      <ChatThread messages={thread.messages} viewer="PLAYER" />
      {thread.status !== 'CLOSED' && (
        <div className="bg-card border-border space-y-3 rounded-xl border p-4">
          <ActionForm action={replyInquiryAction.bind(null, id)} submitLabel="Reply" resetOnSuccess>
            <Label htmlFor="body">Reply</Label>
            <Textarea id="body" name="body" rows={4} maxLength={5000} required />
          </ActionForm>
          <ActionForm action={closeInquiryAction.bind(null, id)} submitLabel="Close ticket" />
        </div>
      )}
    </div>
  )
}
```

In `src/app/(player)/actions.ts`:
- in `createInquiryAction` replace `` redirect(`/inquiries/${id}`) `` with `` redirect(`/more/support/${id}`) ``;
- in `replyInquiryAction` and `closeInquiryAction` replace `` revalidatePath(`/inquiries/${inquiryId}`) `` with `` revalidatePath(`/more/support/${inquiryId}`) ``.

Delete `src/app/(player)/referral/page.tsx`, `src/app/(player)/inquiries/page.tsx` and `src/app/(player)/inquiries/[id]/page.tsx` (and their now-empty folders). In `src/server/queries/player.ts`, delete `listMyBets`, its doc comment and the now-unused `BetResult` type import.

`next.config.ts` — replace:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/referral', destination: '/more/referral', permanent: true },
      { source: '/inquiries', destination: '/more/support', permanent: true },
      { source: '/inquiries/:id', destination: '/more/support/:id', permanent: true },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run tests/unit/redirects.test.ts tests/unit/format.test.ts tests/unit/admin-page-guards.test.ts tests/architecture.test.ts`
Expected: PASS.

- [ ] **Step 6: Manual check**

Run `npm run dev -- -p 3005` and check the following.
- `/bets`: the Open/Settled/Refunded chips work, bets are grouped under a game header, wins read `Won +N` in green, and `?tab=junk` falls back to Open.
- `/wallet`: the balance hero and filter chips work, rows are grouped by ET day, signed amounts are green or red, and Payouts shows only payouts.
- `/more/referral`: the code, Copy (toast), and Share (copies the link on desktop Chrome).
- `/more/support`: New ticket opens the thread as bubbles (yours on the right); Reply and Close work.
- `/referral` and `/inquiries/<id>` redirect permanently (308).

Stop the server.

- [ ] **Step 7: Commit**

Run `npm run check`, then:
```bash
git add -A src/components "src/app/(player)" src/lib/format.ts src/server/queries/player.ts next.config.ts tests/unit
git commit -m "feat: add my bets, wallet and more pages with permanent redirects"
```

---

### Task 11: Admin shell, `DataTable` and `UrlSheet`

**Files:**
- Create: `src/components/admin/admin-nav.tsx`, `src/components/admin/data-table.tsx`, `src/components/admin/url-sheet.tsx`, `src/components/admin/page-header.tsx`
- Modify: `src/lib/table-params.ts` (append `toggleSort`, `isRecordId`), `src/app/admin/layout.tsx`
- Delete: `src/components/nav.tsx`
- Test: `tests/unit/table-params.test.ts` (append)

**Interfaces:**
- Consumes: `getAdminBadges` (Task 6), `isActivePath`, `hrefWith` (Tasks 6–7), `Pagination` (Task 10), `LogoutButton` (Task 7).
- Produces:
  - `toggleSort(current: string, field: string): string`;
  - `isRecordId(value: string | undefined): value is string` (`/^[A-Za-z0-9_-]{1,64}$/`);
  - `type AdminBadges = { openTickets; needsAttention }`, `<AdminSidebar badges />` (≥768px), `<AdminMobileNav badges />` (a `Open menu` button with a left Sheet);
  - `type Column<T> = { key; header; sort?; align?: 'right'; cell(row) }`;
  - `<DataTable<T> basePath params columns rows rowKey rowLink? rowClassName? sort page pageCount total empty footer? />`:
    - a server component;
    - sort headers are links to `?sort=` (page reset);
    - `rowLink` turns the first cell into a link whose `::after` overlay makes the whole row clickable (`scroll={false}`). Tables that need other links inside a row (the ledger) pass no `rowLink`.
  - `<UrlSheet closeHref title description? children />`: a client right Sheet, `w-full` on phones. Esc, the overlay or the close button call `router.replace(closeHref)`. Pages render it only while the drawer param is present and key it by the id.
  - `<PageHeader title children? />`.
- Admin URLs (Tasks 12–15 build the pages): `/admin` Overview, `/admin/players`, `/admin/games`, `/admin/ledger`, `/admin/support`, `/admin/settings`. Ledger and Support return 404 until Tasks 14–15.
- E2E contract: the admin header shows a `Log out` button on every width.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/table-params.test.ts` (add `isRecordId` and `toggleSort` to the `@/lib/table-params` import). This is Review Focus #1 (junk drawer ids):
```ts

describe('toggleSort and isRecordId', () => {
  it('flips the active field and starts new fields ascending', () => {
    expect(toggleSort('balance', 'balance')).toBe('-balance')
    expect(toggleSort('-balance', 'balance')).toBe('balance')
    expect(toggleSort('-joined', 'balance')).toBe('balance')
  })

  it('accepts cuid-like ids only', () => {
    expect(isRecordId('cmh1abc23000008l4')).toBe(true)
    expect(isRecordId(undefined)).toBe(false)
    expect(isRecordId('')).toBe(false)
    expect(isRecordId('../etc')).toBe(false)
    expect(isRecordId('x'.repeat(65))).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/table-params.test.ts`
Expected: FAIL — `toggleSort is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/table-params.ts`:
```ts

/** Header click: same field flips direction; a new field starts ascending. */
export function toggleSort(current: string, field: string): string {
  return current === field ? `-${field}` : field
}

/** Drawer ids (`?player=` etc.): plausible record ids only; anything else is "Not found". */
export function isRecordId(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}
```

`src/components/admin/admin-nav.tsx`:
```tsx
'use client'

import { BookOpen, Gamepad2, LayoutDashboard, LifeBuoy, Menu, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { isActivePath } from '@/lib/url'
import { cn } from '@/lib/utils'

export type AdminBadges = { openTickets: number; needsAttention: boolean }

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/players', label: 'Players', icon: Users, exact: false },
  { href: '/admin/games', label: 'Games', icon: Gamepad2, exact: false },
  { href: '/admin/ledger', label: 'Ledger', icon: BookOpen, exact: false },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, exact: false },
  { href: '/admin/settings', label: 'Settings', icon: Settings, exact: false },
]

function NavLinks({ badges, onNavigate }: { badges: AdminBadges; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActivePath(pathname, item.href, item.exact)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                active ? 'bg-surface-2 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
              {item.href === '/admin' && badges.needsAttention && (
                <>
                  <span aria-hidden className="bg-live ml-auto size-2 rounded-full" />
                  <span className="sr-only">(needs attention)</span>
                </>
              )}
              {item.href === '/admin/support' && badges.openTickets > 0 && (
                <span className="bg-live/15 text-live num ml-auto rounded-full px-2 text-xs">
                  {badges.openTickets}
                  <span className="sr-only"> open tickets</span>
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Left sidebar on ≥ 768px. */
export function AdminSidebar({ badges }: { badges: AdminBadges }) {
  return (
    <aside className="border-border bg-surface sticky top-0 hidden h-dvh flex-col gap-6 border-r p-4 md:flex">
      <Link href="/admin" className="px-3 text-lg font-black tracking-tight">
        Last<span className="text-primary">Digit</span>{' '}
        <span className="text-muted-foreground text-xs">admin</span>
      </Link>
      <nav aria-label="Admin">
        <NavLinks badges={badges} />
      </nav>
    </aside>
  )
}

/** On phones the sidebar becomes a slide-out menu. */
export function AdminMobileNav({ badges }: { badges: AdminBadges }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu />
      </Button>
      <SheetContent side="left" className="w-64">
        <SheetHeader>
          <SheetTitle>Admin</SheetTitle>
          <SheetDescription className="sr-only">Admin sections</SheetDescription>
        </SheetHeader>
        <nav aria-label="Admin" className="px-2">
          <NavLinks badges={badges} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  )
}
```

`src/components/admin/data-table.tsx`:
```tsx
import { ArrowDown, ArrowUp } from 'lucide-react'
import Link from 'next/link'

import { Pagination } from '@/components/pagination'
import { type SearchParams, toggleSort } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: string
  /** Whitelisted sort field for this column, if sortable. */
  sort?: string
  align?: 'right'
  cell: (row: T) => React.ReactNode
}

type Props<T> = {
  basePath: string
  params: SearchParams
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Makes the whole row a link (e.g. `?player=<id>`); `label` is the link text in the first cell. */
  rowLink?: (row: T) => { href: string; label: string }
  rowClassName?: (row: T) => string | undefined
  /** Current sort as in the URL (`field` / `-field`). */
  sort: string
  page: number
  pageCount: number
  total: number
  empty: string
  footer?: React.ReactNode
}

/** Server-driven table: sort links, row links and pagination are plain URLs (spec §5.2). */
export function DataTable<T>(p: Props<T>) {
  return (
    <div className="bg-card border-border rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b">
              {p.columns.map((c) => {
                const active = c.sort !== undefined && p.sort.replace(/^-/, '') === c.sort
                const desc = p.sort.startsWith('-')
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}
                    className={cn(
                      'text-muted-foreground px-3 py-2 font-medium whitespace-nowrap',
                      c.align === 'right' && 'text-right',
                    )}
                  >
                    {c.sort ? (
                      <Link
                        href={hrefWith(p.basePath, p.params, {
                          sort: toggleSort(p.sort, c.sort),
                          page: undefined,
                        })}
                        className="hover:text-foreground inline-flex items-center gap-1"
                      >
                        {c.header}
                        {active &&
                          (desc ? (
                            <ArrowDown aria-hidden className="size-3" />
                          ) : (
                            <ArrowUp aria-hidden className="size-3" />
                          ))}
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row) => {
              const link = p.rowLink?.(row)
              return (
                <tr
                  key={p.rowKey(row)}
                  className={cn(
                    'border-border hover:bg-surface-2 relative border-b last:border-b-0',
                    p.rowClassName?.(row),
                  )}
                >
                  {p.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn('px-3 py-2 whitespace-nowrap', c.align === 'right' && 'num text-right')}
                    >
                      {i === 0 && link ? (
                        <Link
                          href={link.href}
                          scroll={false}
                          className="font-medium after:absolute after:inset-0"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          {p.footer && <tfoot className="border-border border-t font-semibold">{p.footer}</tfoot>}
        </table>
      </div>
      {p.rows.length === 0 && <p className="text-muted-foreground p-6 text-center text-sm">{p.empty}</p>}
      <div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
        <span className="text-muted-foreground text-xs">
          {p.total} {p.total === 1 ? 'row' : 'rows'}
        </span>
        <Pagination basePath={p.basePath} params={p.params} page={p.page} pageCount={p.pageCount} />
      </div>
    </div>
  )
}
```

`src/components/admin/url-sheet.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type Props = {
  /** URL of the current page without the drawer param; closing navigates here. */
  closeHref: string
  title: string
  description?: string
  children: React.ReactNode
}

/**
 * A right-hand drawer bound to a search param (`?player=`, `?game=`, `?ticket=`). The page renders
 * it only while the param is present (key it by the id); Esc, the close button and the overlay
 * remove the param, and the browser back button pops it (spec §5.2).
 */
export function UrlSheet({ closeHref, title, description, children }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        setOpen(false)
        router.replace(closeHref, { scroll: false })
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
```

`src/components/admin/page-header.tsx`:
```tsx
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
```

`src/app/admin/layout.tsx` — replace:
```tsx
import Link from 'next/link'

import { AdminMobileNav, AdminSidebar } from '@/components/admin/admin-nav'
import { LogoutButton } from '@/components/logout-button'
import { getAdminBadges } from '@/server/admin/overview'
import { requireAdmin } from '@/server/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const badges = await getAdminBadges()
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <AdminSidebar badges={badges} />
      <div className="min-w-0">
        <header className="border-border bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
          <AdminMobileNav badges={badges} />
          <span className="text-sm font-medium">{admin.username}</span>
          <Link
            href="/games"

            className="text-muted-foreground hover:text-foreground ml-auto text-sm"
          >
            Player site
          </Link>
          <LogoutButton />
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
```

Delete `src/components/nav.tsx`; nothing imports it any more.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/table-params.test.ts tests/architecture.test.ts tests/unit/admin-page-guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run `npm run dev -- -p 3005` as admin and check the following.
- The left sidebar shows Overview · Players · Games · Ledger · Support · Settings with the active item highlighted.
- Support shows the OPEN ticket count, and Overview shows an orange dot when a game is postponed, a balance is negative or a ticket is open.
- The header shows the admin username, `Player site` and `Log out`.
- At 390px the sidebar is hidden and `Open menu` slides it in from the left.

Stop the server.

- [ ] **Step 6: Commit**

Run `npm run check`, then:
```bash
git add -A src/lib/table-params.ts src/components/admin src/components/nav.tsx src/app/admin/layout.tsx tests/unit/table-params.test.ts
git commit -m "feat: add admin console shell, data table and URL-bound drawer"
```

---

### Task 12: Admin overview with Recharts

**Files:**
- Create: `src/components/admin/kpi-tile.tsx`, `src/components/admin/volume-chart.tsx`
- Modify: `package.json`, `package-lock.json`, `src/lib/format.ts` (add `formatRelative`), `src/app/admin/page.tsx`, `src/server/admin/queries.ts` (delete `getDashboardStats`), `tests/integration/admin-queries.test.ts`
- Test: `tests/unit/format.test.ts` (append)

**Interfaces:**
- Consumes: `getOverviewStats`, `getDailyVolume`, `getTopBettorsToday` (Task 6), `shortDayLabel` (Task 2), `Tooltip*` (Task 1), `PageHeader` (Task 11).
- Produces:
  - `formatRelative(then: Date, now: Date): string` (`just now` / `12 min ago` / `3 h ago` / `3 d ago`);
  - `<KpiTile label value sub? tone?="danger" />`;
  - `<VolumeChart data={VolumePoint[]} />` (client; two bar series: Volume `--chart-1` (accent) and House take `--chart-2` (info)).
- Drawer links: postponed games → `/admin/games?game=<id>`, negative balances and top bettors → `/admin/players?player=<id>`, open tickets → `/admin/support?ticket=<id>`.

- [ ] **Step 1: Install Recharts (exact)**

```bash
npm i -E recharts@3.10.1 react-is@19.1.0
```
`react-is` is a peer of Recharts and is pinned to the installed React version. Neither package has an install script.

- [ ] **Step 2: Write the failing test**

In `tests/unit/format.test.ts`, add `formatRelative` to the import and add inside the `describe`:
```ts
  it('formats relative times', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    expect(formatRelative(new Date('2026-11-11T11:59:30Z'), now)).toBe('just now')
    expect(formatRelative(new Date('2026-11-11T11:48:00Z'), now)).toBe('12 min ago')
    expect(formatRelative(new Date('2026-11-11T09:00:00Z'), now)).toBe('3 h ago')
    expect(formatRelative(new Date('2026-11-08T12:00:00Z'), now)).toBe('3 d ago')
  })
```

Run: `npx vitest run tests/unit/format.test.ts`
Expected: FAIL — `formatRelative is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/format.ts`:
```ts

/** "just now", "12 min ago", "3 h ago", "2 d ago" */
export function formatRelative(then: Date, now: Date): string {
  const min = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}
```

`src/components/admin/kpi-tile.tsx`:
```tsx
import { cn } from '@/lib/utils'

type Props = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'danger' }

export function KpiTile({ label, value, sub, tone }: Props) {
  return (
    <div
      className={cn('bg-card border-border rounded-xl border p-4', tone === 'danger' && 'border-danger/60')}
    >
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className={cn('num mt-1 text-2xl font-bold', tone === 'danger' && 'text-danger')}>{value}</div>
      {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
    </div>
  )
}
```

`src/components/admin/volume-chart.tsx`:
```tsx
'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { shortDayLabel } from '@/lib/dates'

export type VolumePoint = { date: string; volume: number; houseTake: number }

/** Last 14 ET days: BET volume and house take (spec §5.1). */
export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const rows = data.map((d) => ({ ...d, day: shortDayLabel(d.date) }))
  return (
    <figure className="h-72" aria-label="Bet volume and house take per day, last 14 days">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
          <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--foreground)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="volume" name="Volume" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="houseTake" name="House take" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
```

`src/app/admin/page.tsx` — replace:
```tsx
import Link from 'next/link'

import { KpiTile } from '@/components/admin/kpi-tile'
import { PageHeader } from '@/components/admin/page-header'
import { VolumeChart } from '@/components/admin/volume-chart'
import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatPoints, formatRelative } from '@/lib/format'
import { getDailyVolume, getOverviewStats, getTopBettorsToday } from '@/server/admin/overview'
import { requireAdmin } from '@/server/session'

export default async function AdminOverviewPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />
      <OverviewBody />
    </div>
  )
}

async function OverviewBody() {
  const now = new Date()
  const [s, daily, top] = await Promise.all([
    getOverviewStats(now),
    getDailyVolume(14, now),
    getTopBettorsToday(now),
  ])
  const allClear = s.postponed.length === 0 && s.negativeBalances.length === 0 && s.openTickets.length === 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Players" value={formatPoints(s.playerCount)} sub={`+${s.newPlayers7d} in 7d`} />
        <KpiTile
          label="Open pools"
          value={formatPoints(s.openPoolTotal)}
          sub={`${s.openPoolCount} ${s.openPoolCount === 1 ? 'game' : 'games'}`}
        />
        <KpiTile
          label="House take (7d)"
          value={
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4">
                  {formatPoints(s.houseTake7d)}
                </span>
              </TooltipTrigger>
              <TooltipContent>All time: {formatPoints(s.houseTakeAllTime)}</TooltipContent>
            </Tooltip>
          }
          sub="Last 7 ET days"
        />
        <KpiTile
          label="Sync"
          tone={s.syncStale ? 'danger' : undefined}
          value={s.lastSyncAt ? formatRelative(s.lastSyncAt, now) : 'never'}
          sub={s.lastSyncAt ? formatDateTime(s.lastSyncAt) : 'No successful sync yet'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumeChart data={daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            {allClear ? (
              <p className="text-primary text-sm">All clear</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {s.postponed.map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/games?game=${g.id}`} className="flex justify-between gap-2 py-2">
                      <span>
                        Postponed: {g.awayTeam} @ {g.homeTeam}
                      </span>
                      <span className="text-live">Review</span>
                    </Link>
                  </li>
                ))}
                {s.negativeBalances.map((u) => (
                  <li key={u.id}>
                    <Link href={`/admin/players?player=${u.id}`} className="flex justify-between gap-2 py-2">
                      <span>Negative balance: {u.username}</span>
                      <PointsAmount value={u.balance} className="text-danger" />
                    </Link>
                  </li>
                ))}
                {s.openTickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/support?ticket=${t.id}`} className="flex justify-between gap-2 py-2">
                      <span>
                        Ticket: {t.subject} <span className="text-muted-foreground">· {t.username}</span>
                      </span>
                      <span className="text-live">Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top bettors today</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-muted-foreground text-sm">No bets yet today.</p>
            ) : (
              <ol className="divide-border divide-y text-sm">
                {top.map((b, i) => (
                  <li key={b.userId}>
                    <Link href={`/admin/players?player=${b.userId}`} className="flex items-center gap-3 py-2">
                      <span className="num text-muted-foreground w-4">{i + 1}</span>
                      <span className="flex-1">{b.username}</span>
                      <PointsAmount value={b.volume} unit />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
```

In `src/server/admin/queries.ts`, delete `SYNC_STALE_MS`, `getDashboardStats` and the now-unused `import { getLastSyncAt } from '../settings'`. Its behaviour is covered by `getOverviewStats` and its tests (Task 6). Replace `tests/integration/admin-queries.test.ts` with what is left (Task 13 deletes the file):
```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { listTransactionsAdmin, searchPlayers } from '@/server/admin/queries'

import { fundUser, makeUser, resetDb } from '../helpers/db'

describe('admin queries', () => {
  beforeEach(resetDb)

  it('searches players case-insensitively and filters transactions', async () => {
    const kyle = await makeUser({ username: 'Kyle' })
    await makeUser({ username: 'bob' })
    await makeUser({ username: 'boss', role: 'ADMIN' })
    expect((await searchPlayers('KY')).map((u) => u.username)).toEqual(['Kyle'])
    await fundUser(kyle.id, 10)
    const txs = await listTransactionsAdmin({ username: 'KYLE', type: 'ADMIN_GRANT' })
    expect(txs).toHaveLength(1)
    expect(txs[0]?.user.username).toBe('Kyle')
  })
})
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/unit/format.test.ts tests/integration/admin-queries.test.ts tests/unit/admin-page-guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run `npm run dev -- -p 3005` as admin; `/admin` should show the following.
- Four tiles: Players with `+N in 7d`, Open pools with total and game count, House take (7d) with all-time in a tooltip on hover or focus, and Sync with relative time, red when stale over 30 min.
- A 14-day bar chart with Volume (green) and House take (blue).
- Needs attention lists, or "All clear".
- Top bettors today.

Stop the server.

- [ ] **Step 6: Commit**

Run `npm run check`, then:
```bash
git add package.json package-lock.json src/lib/format.ts src/components/admin src/app/admin/page.tsx src/server/admin/queries.ts tests/unit/format.test.ts tests/integration/admin-queries.test.ts
git commit -m "feat: add admin overview with KPIs, volume chart and attention list"
```

---

### Task 13: Admin Players — table, filters and player drawer with action dialogs

**Files:**
- Create: `src/components/admin/action-dialog.tsx`, `src/components/admin/field.tsx`, `src/components/admin/filter-form.tsx`, `src/components/admin/select-field.tsx`, `src/app/admin/players/player-drawer.tsx`
- Modify: `src/app/admin/players/page.tsx`, `src/app/admin/actions.ts` (revalidation paths), `src/server/admin/queries.ts` (delete `searchPlayers`), `tests/unit/admin-page-guards.test.ts`
- Delete: `src/app/admin/players/[id]/page.tsx`, `tests/integration/admin-queries.test.ts`
- Test: `tests/unit/admin-page-guards.test.ts` (the player drawer must not load data before the guard)

**Interfaces:**
- Consumes:
  - from Task 6: `parsePlayerListParams`, `listPlayers`, `PlayerRow`, `formatSort`, `hrefWith`, `firstParam`;
  - from Task 11: `isRecordId`, `DataTable`, `UrlSheet`, `PageHeader`;
  - from Task 1: `ActionForm` with `confirm` / `onSuccess`;
  - existing: `getPlayerDetail`, the admin actions (`adjustPointsAction`, `suspendAction`, `unsuspendAction`, `stakeLimitAction`, `resetPasswordAction`).
- Produces:
  - `<ActionDialog triggerLabel title description? submitLabel action confirm? destructive? children />`, which closes itself after success;
  - `<Field id label hint? children />`;
  - `<FilterForm action keep? children />`: a plain `method="get"` form that submits to the table URL, so the page resets to 1, and carries `keep` (e.g. the current sort) as hidden inputs;
  - `<SelectField id name label defaultValue options />`: a shadcn Select inside the GET form, where `all` means no filter.
- Every admin action now revalidates `revalidatePath('/admin', 'layout')`, which refreshes the tables, the open drawer and the sidebar badges.
- E2E contract:
  - the search input is labelled `Search players`;
  - a row link is named exactly by the username;
  - the drawer is a dialog named by the username;
  - `Grant` → fields `Amount`, `Note` → `Grant points` → toast `Points updated`.

- [ ] **Step 1: Update the guard test first**

In `tests/unit/admin-page-guards.test.ts`:
- delete the `'admin/players/[id]'` entry;
- change the `'admin/players'` entry to pass a drawer param, so the test proves the drawer data is not read before the guard either:
```ts
  ['admin/players', () => import('@/app/admin/players/page'), sp({ player: 'x' })],
```
Run: `npx vitest run tests/unit/admin-page-guards.test.ts`
Expected: FAIL — `covers every admin and player page` still finds `admin/players/[id]` on disk.

- [ ] **Step 2: Shared admin form components**

`src/components/admin/action-dialog.tsx`:
```tsx
'use client'

import { useState } from 'react'

import { ActionForm } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ActionState } from '@/lib/action-state'

type Props = {
  triggerLabel: string
  title: string
  description?: string
  submitLabel: string
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  /** Second step: an AlertDialog asking to confirm before the form is submitted. */
  confirm?: { title: string; description: string; actionLabel: string }
  destructive?: boolean
  children?: React.ReactNode
}

/** A trigger button that opens a Dialog holding an ActionForm; closes itself on success. */
export function ActionDialog({
  triggerLabel,
  title,
  description,
  submitLabel,
  action,
  confirm,
  destructive,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={destructive ? 'destructive' : 'outline'} size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={action}
          submitLabel={submitLabel}
          confirm={confirm}
          destructive={destructive}
          onSuccess={() => setOpen(false)}
          className="grid gap-3"
        >
          {children}
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
```

`src/components/admin/field.tsx`:
```tsx
import { Label } from '@/components/ui/label'

/** Label + control + optional hint, stacked. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
```

`src/components/admin/filter-form.tsx`:
```tsx
import { Button } from '@/components/ui/button'

/**
 * GET form for table filters: submitting loads `action` with the fields as search params
 * (page resets because it is not a field). `keep` carries params such as the current sort.
 */
export function FilterForm({
  action,
  keep,
  children,
}: {
  action: string
  keep?: Record<string, string | undefined>
  children: React.ReactNode
}) {
  return (
    <form
      method="get"
      action={action}
      className="bg-card border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3"
    >
      {Object.entries(keep ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      {children}
      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  )
}
```

`src/components/admin/select-field.tsx`:
```tsx
'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** shadcn Select inside a GET form; `all` means "no filter" to the parsers. */
export function SelectField({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string
  name: string
  label: string
  defaultValue: string
  options: { value: string; label: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger id={id} className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 3: Players page and drawer**

`src/app/admin/players/player-drawer.tsx`:
- Grant and Deduct are separate dialogs posting `direction` as a hidden field.
- Suspend has an optional date and an AlertDialog confirm. Unsuspend is a single button.
- Tabs show Bets / Ledger / Referrals (latest 50, from `getPlayerDetail`).
```tsx
import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { ActionDialog } from '@/components/admin/action-dialog'
import { Field } from '@/components/admin/field'
import { BetResult } from '@/components/bet-result'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime } from '@/lib/format'
import { formatEnding } from '@/lib/game/ending'
import { isSuspended } from '@/lib/suspension'
import { TX_TYPE_LABELS } from '@/lib/wallet'
import type { getPlayerDetail } from '@/server/admin/queries'

import {
  adjustPointsAction,
  resetPasswordAction,
  stakeLimitAction,
  suspendAction,
  unsuspendAction,
} from '../actions'

type Player = NonNullable<Awaited<ReturnType<typeof getPlayerDetail>>>

export function PlayerDrawer({ player: p }: { player: Player }) {
  const suspended = isSuspended(p)
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Balance</dt>
          <dd>
            <PointsAmount value={p.balance} unit className={p.balance < 0 ? 'text-danger' : ''} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Status</dt>
          <dd className={suspended ? 'text-danger' : 'text-primary'}>
            {suspended
              ? `Suspended${p.suspendedUntil ? ` until ${formatDateTime(p.suspendedUntil)}` : ' (indefinite)'}`
              : 'Active'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Referred by</dt>
          <dd>
            {p.referredBy ? (
              <Link
                href={`/admin/players?player=${p.referredBy.id}`}
                className="text-primary hover:underline"
              >
                {p.referredBy.username}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Joined</dt>
          <dd>{formatDateTime(p.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Stake limit / game</dt>
          <dd className="num">{p.stakeLimitPerGame ?? 'None'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Referral code</dt>
          <dd className="num">{p.referralCode}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <ActionDialog
          triggerLabel="Grant"
          title={`Grant points to ${p.username}`}
          submitLabel="Grant points"
          action={adjustPointsAction.bind(null, p.id)}
        >
          <input type="hidden" name="direction" value="GRANT" />
          <Field id="amount" label="Amount">
            <Input id="amount" name="amount" type="number" min={1} step={1} required />
          </Field>
          <Field id="note" label="Note">
            <Input id="note" name="note" maxLength={500} required />
          </Field>
        </ActionDialog>
        <ActionDialog
          triggerLabel="Deduct"
          title={`Deduct points from ${p.username}`}
          submitLabel="Deduct points"
          action={adjustPointsAction.bind(null, p.id)}
        >
          <input type="hidden" name="direction" value="DEDUCT" />
          <Field id="amount" label="Amount">
            <Input id="amount" name="amount" type="number" min={1} step={1} required />
          </Field>
          <Field id="note" label="Note">
            <Input id="note" name="note" maxLength={500} required />
          </Field>
        </ActionDialog>
        {suspended ? (
          <ActionForm
            action={unsuspendAction.bind(null, p.id)}
            submitLabel="Unsuspend"
            className="contents"
          />
        ) : (
          <ActionDialog
            triggerLabel="Suspend"
            title={`Suspend ${p.username}`}
            description="Leave the date empty to suspend until lifted."
            submitLabel="Suspend"
            destructive
            action={suspendAction.bind(null, p.id)}
            confirm={{
              title: `Suspend ${p.username}?`,
              description: 'They are logged out and cannot bet until the suspension ends.',
              actionLabel: 'Suspend',
            }}
          >
            <Field id="until" label="Suspend until (optional, UTC date)">
              <Input id="until" name="until" type="date" />
            </Field>
          </ActionDialog>
        )}
        <ActionDialog
          triggerLabel="Stake limit"
          title="Stake limit per game"
          description="Leave empty to remove the limit."
          submitLabel="Save stake limit"
          action={stakeLimitAction.bind(null, p.id)}
        >
          <Field id="limit" label="Limit (points per game)">
            <Input
              id="limit"
              name="limit"
              type="number"
              min={1}
              step={1}
              defaultValue={p.stakeLimitPerGame ?? ''}
            />
          </Field>
        </ActionDialog>
        <ActionDialog
          triggerLabel="Reset password"
          title={`Reset password for ${p.username}`}
          submitLabel="Reset password"
          action={resetPasswordAction.bind(null, p.id)}
        >
          <Field id="newPassword" label="New password" hint="At least 8 characters">
            <Input id="newPassword" name="newPassword" type="text" minLength={8} required />
          </Field>
        </ActionDialog>
      </div>

      <Tabs defaultValue="bets">
        <TabsList>
          <TabsTrigger value="bets">Bets</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="referrals">Referrals ({p.referrals.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="bets">
          <ul className="divide-border divide-y text-sm">
            {p.bets.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2">
                <Link href={`/admin/games?game=${b.gameId}`} className="hover:underline">
                  {b.game.awayTeam} @ {b.game.homeTeam}
                </Link>
                <span className="num">{formatEnding(b)}</span>
                <PointsAmount value={b.stake} />
                <BetResult result={b.result} payout={b.payout} />
              </li>
            ))}
            {p.bets.length === 0 && <li className="text-muted-foreground py-2">No bets.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="ledger">
          <ul className="divide-border divide-y text-sm">
            {p.transactions.map((t) => (
              <li key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2">
                <span>
                  {TX_TYPE_LABELS[t.type]}
                  <span className="text-muted-foreground block text-xs">
                    {formatDateTime(t.createdAt)}
                    {t.note ? ` · ${t.note}` : ''}
                  </span>
                </span>
                <PointsAmount value={t.amount} signed />
                <PointsAmount value={t.balanceAfter} className="text-muted-foreground" />
              </li>
            ))}
            {p.transactions.length === 0 && <li className="text-muted-foreground py-2">No transactions.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="referrals">
          <ul className="divide-border divide-y text-sm">
            {p.referrals.map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <Link href={`/admin/players?player=${r.id}`} className="hover:underline">
                  {r.username}
                </Link>
                <span className="text-muted-foreground">{formatDateTime(r.createdAt)}</span>
              </li>
            ))}
            {p.referrals.length === 0 && <li className="text-muted-foreground py-2">No referrals.</li>}
          </ul>
        </TabsContent>
      </Tabs>
    </>
  )
}
```

`src/app/admin/players/page.tsx` — replace. The `FilterForm` is keyed by the parsed params, so its default values follow navigation. The drawer loads only when `?player=` holds a plausible id; anything else shows "Not found".
```tsx
import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { SelectField } from '@/components/admin/select-field'
import { UrlSheet } from '@/components/admin/url-sheet'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { firstParam } from '@/lib/pagination'
import { isSuspended } from '@/lib/suspension'
import { formatSort, isRecordId, type SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { getPlayerDetail } from '@/server/admin/queries'
import {
  listPlayers,
  parsePlayerListParams,
  type PlayerListParams,
  type PlayerRow,
} from '@/server/admin/tables/players'
import { requireAdmin } from '@/server/session'

import { PlayerDrawer } from './player-drawer'

const BASE = '/admin/players'

export default async function AdminPlayersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parsePlayerListParams(sp)
  const sort = formatSort(params.sort)
  const drawerId = firstParam(sp.player)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Players" />
      <FilterForm key={formKey} action={BASE} keep={{ sort }}>
        <Field id="q" label="Search players">
          <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Username" className="w-48" />
        </Field>
        <SelectField
          id="status"
          name="status"
          label="Status"
          defaultValue={params.status ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </FilterForm>
      <PlayersTable sp={sp} params={params} />
      {drawerId !== undefined && <PlayerSheet sp={sp} id={drawerId} />}
    </>
  )
}

async function PlayersTable({ sp, params }: { sp: SearchParams; params: PlayerListParams }) {
  const result = await listPlayers(params)
  return (
    <DataTable<PlayerRow>
      basePath={BASE}
      params={{ ...sp, player: undefined }}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(r) => r.id}
      rowLink={(r) => ({ href: hrefWith(BASE, sp, { player: r.id }), label: r.username })}
      empty="No players found."
      columns={[
        { key: 'username', header: 'Username', sort: 'username', cell: (r) => r.username },
        {
          key: 'balance',
          header: 'Balance',
          sort: 'balance',
          align: 'right',
          cell: (r) => <PointsAmount value={r.balance} className={r.balance < 0 ? 'text-danger' : ''} />,
        },
        {
          key: 'status',
          header: 'Status',
          cell: (r) => (isSuspended(r) ? <span className="text-danger">Suspended</span> : 'Active'),
        },
        { key: 'limit', header: 'Stake limit', align: 'right', cell: (r) => r.stakeLimitPerGame ?? '—' },
        {
          key: 'referrals',
          header: 'Referrals',
          sort: 'referrals',
          align: 'right',
          cell: (r) => r._count.referrals,
        },
        { key: 'joined', header: 'Joined', sort: 'joined', cell: (r) => formatDateTime(r.createdAt) },
      ]}
    />
  )
}

async function PlayerSheet({ sp, id }: { sp: SearchParams; id: string }) {
  const player = isRecordId(id) ? await getPlayerDetail(id) : null
  return (
    <UrlSheet
      key={id}
      closeHref={hrefWith(BASE, sp, { player: undefined })}
      title={player?.username ?? 'Not found'}
    >
      {player ? <PlayerDrawer player={player} /> : <p className="text-muted-foreground">Player not found.</p>}
    </UrlSheet>
  )
}
```

`src/app/admin/actions.ts` — replace. The bodies are unchanged; every `revalidatePath(...)` becomes `revalidatePath('/admin', 'layout')`:
```ts
'use server'

import { revalidatePath } from 'next/cache'

import { type ActionState, runAction } from '@/lib/action-state'
import {
  adjustPoints,
  resetPassword,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { closeInquiry, replyToInquiry } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { setReferralBonus } from '@/server/settings'
import { voidGame } from '@/server/settlement'
import { defaultFetcher, syncGames } from '@/server/sync/sync'

export async function adjustPointsAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(
    () =>
      adjustPoints(admin.id, userId, {
        direction: fd.get('direction'),
        amount: fd.get('amount'),
        note: fd.get('note'),
      }),
    'Points updated',
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function suspendAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('until') ?? '').trim()
  const until = v ? new Date(`${v}T00:00:00Z`) : null
  if (until && Number.isNaN(until.getTime())) return { error: 'Invalid date' }
  const r = await runAction(() => suspendPlayer(admin.id, userId, until), 'Player suspended')
  revalidatePath('/admin', 'layout')
  return r
}

export async function unsuspendAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => unsuspendPlayer(admin.id, userId), 'Suspension lifted')
  revalidatePath('/admin', 'layout')
  return r
}

export async function stakeLimitAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('limit') ?? '').trim()
  const r = await runAction(() => setStakeLimit(admin.id, userId, v === '' ? null : v), 'Stake limit saved')
  revalidatePath('/admin', 'layout')
  return r
}

export async function resetPasswordAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  return runAction(() => resetPassword(admin.id, userId, fd.get('newPassword')), 'Password reset')
}

export async function voidGameAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => voidGame(admin.id, gameId, fd.get('reason')), 'Game voided')
  revalidatePath('/admin', 'layout')
  return r
}

export async function forceSyncAction(): Promise<ActionState> {
  await requireAdmin()
  try {
    const r = await syncGames({ fetchGames: defaultFetcher() })
    revalidatePath('/admin', 'layout')
    return {
      ok: `Sync complete: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped, ${r.settled} settled, ${r.errors} errors`,
    }
  } catch (e) {
    return { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function adminReplyAction(
  inquiryId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => replyToInquiry(admin.id, inquiryId, { body: fd.get('body') }), 'Reply sent')
  revalidatePath('/admin', 'layout')
  return r
}

export async function adminCloseAction(inquiryId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => closeInquiry(admin.id, inquiryId), 'Inquiry closed')
  revalidatePath('/admin', 'layout')
  return r
}

export async function referralBonusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => setReferralBonus(admin.id, fd.get('referralBonus')), 'Referral bonus saved')
  revalidatePath('/admin', 'layout')
  return r
}
```

Delete `src/app/admin/players/[id]/page.tsx`. In `src/server/admin/queries.ts`, delete `searchPlayers` (`listPlayers` replaces it). Delete `tests/integration/admin-queries.test.ts`: its last test covered `searchPlayers` and `listTransactionsAdmin`, which `tests/integration/admin-tables.test.ts` (Task 6) now covers through `listPlayers` and `listLedger`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/admin-page-guards.test.ts tests/architecture.test.ts tests/integration/admin-players.test.ts tests/integration/admin-tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run `npm run dev -- -p 3005` as admin, then check `/admin/players`.
- Search narrows by username, the Status select filters, and clicking a header sorts (an arrow shows the direction). `?sort=passwordHash&page=x` falls back to newest first, page 1.
- Clicking a row opens the drawer and the URL gets `?player=<id>`. Esc closes it and removes the param; Back reopens it.
- `/admin/players?player=nope` shows a "Not found" drawer.
- Grant 50 with a note: the toast "Points updated" appears, the dialog closes, and the drawer balance and the Ledger tab update.
- Suspend asks for confirmation; the status turns Suspended and an Unsuspend button appears.
- At 390px the drawer is full width.

Stop the server.

- [ ] **Step 6: Commit**

Run `npm run check`, then:
```bash
git add -A src/components/admin src/app/admin/players src/app/admin/actions.ts src/server/admin/queries.ts tests/unit/admin-page-guards.test.ts tests/integration/admin-queries.test.ts
git commit -m "feat: add admin players table with player drawer and action dialogs"
```

---

### Task 14: Admin Games and Ledger

**Files:**
- Create: `src/app/admin/games/game-drawer.tsx`, `src/app/admin/ledger/page.tsx`
- Modify: `src/server/admin/queries.ts` (add `getGameDetail`; delete `listGamesAdmin`, `listTransactionsAdmin`), `src/app/admin/games/page.tsx`, `tests/unit/admin-page-guards.test.ts`
- Delete: `src/app/admin/transactions/page.tsx`
- Test: `tests/integration/admin-details.test.ts`

**Interfaces:**
- Consumes:
  - from Task 6: `parseGameListParams`, `listGames`, `GAME_STATUSES`, `GameRow`, `parseLedgerListParams`, `listLedger`, `LEDGER_TYPES`, `LedgerRow`;
  - from Task 3: `getEndingStakes`;
  - from Task 9: `EndingHeatmap` (read-only), `GameHeader`, `winningEnding`;
  - from Task 13: `ActionDialog`, `FilterForm`, `SelectField`, `Field`;
  - existing: `voidGameAction`, `forceSyncAction`, `TX_TYPE_LABELS`.
- Produces: `getGameDetail(id) → Promise<{ game: Game; stakes: EndingStakes; winners: (Bet & { user: { id; username } })[] } | null>`.
- Routes:
  - `/admin/games?q&status&from&to&sort&page&game=<id>` (POSTPONED rows highlighted, `Force sync` in the header);
  - `/admin/ledger?q&type&from&to&sort&page` (totals row "Total for this filter"; the player name links to `/admin/players?player=<id>`).

- [ ] **Step 1: Write the failing test**

`tests/integration/admin-details.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db'
import { getGameDetail, getPlayerDetail } from '@/server/admin/queries'
import { placeBet } from '@/server/bets'

import { fundUser, makeGame, makeUser, resetDb } from '../helpers/db'

describe('admin drawer details', () => {
  beforeEach(resetDb)

  it('loads a game with its pool breakdown and winners', async () => {
    const u = await makeUser({ username: 'winner' })
    await fundUser(u.id, 500)
    const g = await makeGame()
    const bet = await placeBet(u.id, { gameId: g.id, awayDigit: 9, homeDigit: 6, stake: 100 })
    await prisma.bet.update({ where: { id: bet.id }, data: { result: 'WON', payout: 90 } })

    const d = await getGameDetail(g.id)
    expect(d?.game.id).toBe(g.id)
    expect(d?.stakes.cells[9]?.[6]).toBe(100)
    expect(d?.winners.map((w) => [w.user.username, w.payout])).toEqual([['winner', 90]])
    expect(await getGameDetail('missing')).toBeNull()
  })

  it('loads players only, never admins', async () => {
    const admin = await makeUser({ role: 'ADMIN' })
    const p = await makeUser()
    expect((await getPlayerDetail(p.id))?.id).toBe(p.id)
    expect(await getPlayerDetail(admin.id)).toBeNull()
    expect(await getPlayerDetail('missing')).toBeNull()
  })
})
```

In `tests/unit/admin-page-guards.test.ts`, replace the `'admin/transactions'` entry with:
```ts
  ['admin/ledger', () => import('@/app/admin/ledger/page'), sp()],
```

Run: `npx vitest run tests/integration/admin-details.test.ts tests/unit/admin-page-guards.test.ts`
Expected: FAIL — `getGameDetail` is not exported, and `@/app/admin/ledger/page` is missing.

- [ ] **Step 2: Implement**

`src/server/admin/queries.ts` — replace (only the drawer loaders remain):
```ts
import { prisma } from '@/lib/db'

import { getEndingStakes } from '../queries/stakes'

export function getPlayerDetail(id: string) {
  return prisma.user.findFirst({
    where: { id, role: 'PLAYER' },
    include: {
      referredBy: { select: { id: true, username: true } },
      referrals: { select: { id: true, username: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      bets: { include: { game: true }, orderBy: { createdAt: 'desc' }, take: 50 },
      transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
}

/** Game drawer: the game, its pool breakdown and its winning bets (with usernames — admin only). */
export async function getGameDetail(id: string) {
  const game = await prisma.game.findUnique({ where: { id } })
  if (!game) return null
  const [stakes, winners] = await Promise.all([
    getEndingStakes(id),
    prisma.bet.findMany({
      where: { gameId: id, result: 'WON' },
      include: { user: { select: { id: true, username: true } } },
      orderBy: [{ payout: 'desc' }, { id: 'asc' }],
    }),
  ])
  return { game, stakes, winners }
}
```

`src/app/admin/games/game-drawer.tsx`:
- the summary (`GameHeader`) and house take;
- the read-only pool heatmap with the winning ending ringed;
- the winning bets with usernames;
- Void (reason required, then an AlertDialog) unless the game is already VOID.
```tsx
import Link from 'next/link'

import { ActionDialog } from '@/components/admin/action-dialog'
import { Field } from '@/components/admin/field'
import { EndingHeatmap } from '@/components/games/ending-heatmap'
import { GameHeader } from '@/components/games/game-header'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { formatEnding, winningEnding } from '@/lib/game/ending'
import type { getGameDetail } from '@/server/admin/queries'

import { voidGameAction } from '../actions'

type Detail = NonNullable<Awaited<ReturnType<typeof getGameDetail>>>

export function GameDrawer({ detail, now }: { detail: Detail; now: Date }) {
  const { game, stakes, winners } = detail
  return (
    <>
      <GameHeader game={game} winners={winners.length} now={now} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">House take</dt>
          <dd>
            <PointsAmount value={game.houseTake} unit />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">External id</dt>
          <dd className="num">{game.externalId}</dd>
        </div>
      </dl>
      <section aria-label="Pool breakdown" className="space-y-2">
        <h3 className="text-sm font-semibold">Pool breakdown</h3>
        <EndingHeatmap
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          cells={stakes.cells}
          winning={winningEnding(game)}
        />
      </section>
      <section aria-label="Winning bets" className="space-y-2">
        <h3 className="text-sm font-semibold">Winning bets ({winners.length})</h3>
        {winners.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {winners.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 py-2">
                <Link href={`/admin/players?player=${b.user.id}`} className="hover:underline">
                  {b.user.username}
                </Link>
                <span className="num">{formatEnding(b)}</span>
                <PointsAmount value={b.stake} />
                <PointsAmount value={b.payout} signed />
              </li>
            ))}
          </ul>
        )}
      </section>
      {game.status !== 'VOID' && (
        <ActionDialog
          triggerLabel="Void game"
          title="Void this game"
          description="Every stake is refunded and any payouts are reversed."
          submitLabel="Void game"
          destructive
          action={voidGameAction.bind(null, game.id)}
          confirm={{
            title: `Void ${game.awayTeam} @ ${game.homeTeam}?`,
            description: 'This cannot be undone.',
            actionLabel: 'Void game',
          }}
        >
          <Field id="reason" label="Reason">
            <Input id="reason" name="reason" maxLength={200} required />
          </Field>
        </ActionDialog>
      )}
    </>
  )
}
```

`src/app/admin/games/page.tsx` — replace:
```tsx
import { ActionForm } from '@/components/action-form'
import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { SelectField } from '@/components/admin/select-field'
import { UrlSheet } from '@/components/admin/url-sheet'
import { PointsAmount } from '@/components/points-amount'
import { StatusPill } from '@/components/status-pill'
import { Input } from '@/components/ui/input'
import { formatTipoff } from '@/lib/format'
import { displayStatus } from '@/lib/game/status'
import { firstParam } from '@/lib/pagination'
import { formatSort, isRecordId, type SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { getGameDetail } from '@/server/admin/queries'
import {
  GAME_STATUSES,
  type GameListParams,
  type GameRow,
  listGames,
  parseGameListParams,
} from '@/server/admin/tables/games'
import { requireAdmin } from '@/server/session'

import { forceSyncAction } from '../actions'
import { GameDrawer } from './game-drawer'

const BASE = '/admin/games'

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parseGameListParams(sp)
  const drawerId = firstParam(sp.game)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Games">
        <ActionForm action={forceSyncAction} submitLabel="Force sync" className="flex items-center gap-2" />
      </PageHeader>
      <FilterForm key={formKey} action={BASE} keep={{ sort: formatSort(params.sort) }}>
        <Field id="q" label="Team">
          <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="e.g. LAL" className="w-28" />
        </Field>
        <SelectField
          id="status"
          name="status"
          label="Status"
          defaultValue={params.status ?? 'all'}
          options={[{ value: 'all', label: 'All' }, ...GAME_STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        <Field id="from" label="From (ET)">
          <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </Field>
        <Field id="to" label="To (ET)">
          <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </Field>
      </FilterForm>
      <GamesTable sp={sp} params={params} />
      {drawerId !== undefined && <GameSheet sp={sp} id={drawerId} />}
    </>
  )
}

async function GamesTable({ sp, params }: { sp: SearchParams; params: GameListParams }) {
  const result = await listGames(params)
  const now = new Date()
  return (
    <DataTable<GameRow>
      basePath={BASE}
      params={{ ...sp, game: undefined }}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(g) => g.id}
      rowLink={(g) => ({ href: hrefWith(BASE, sp, { game: g.id }), label: `${g.awayTeam} @ ${g.homeTeam}` })}
      rowClassName={(g) => (g.status === 'POSTPONED' ? 'bg-live/10' : undefined)}
      empty="No games."
      columns={[
        { key: 'matchup', header: 'Matchup', cell: (g) => `${g.awayTeam} @ ${g.homeTeam}` },
        { key: 'tipoff', header: 'Tip-off', sort: 'tipoff', cell: (g) => formatTipoff(g.startsAt) },
        {
          key: 'status',
          header: 'Status',
          sort: 'status',
          cell: (g) => <StatusPill status={displayStatus(g, now)} />,
        },
        {
          key: 'score',
          header: 'Score',
          align: 'right',
          cell: (g) => `${g.awayScore ?? '–'}-${g.homeScore ?? '–'}`,
        },
        {
          key: 'pool',
          header: 'Pool',
          sort: 'pool',
          align: 'right',
          cell: (g) => <PointsAmount value={g.pool} />,
        },
        {
          key: 'houseTake',
          header: 'House take',
          sort: 'houseTake',
          align: 'right',
          cell: (g) => <PointsAmount value={g.houseTake} />,
        },
        { key: 'winners', header: 'Winners', align: 'right', cell: (g) => g._count.bets },
      ]}
    />
  )
}

async function GameSheet({ sp, id }: { sp: SearchParams; id: string }) {
  const detail = isRecordId(id) ? await getGameDetail(id) : null
  return (
    <UrlSheet
      key={id}
      closeHref={hrefWith(BASE, sp, { game: undefined })}
      title={detail ? `${detail.game.awayTeam} @ ${detail.game.homeTeam}` : 'Not found'}
    >
      {detail ? (
        <GameDrawer detail={detail} now={new Date()} />
      ) : (
        <p className="text-muted-foreground">Game not found.</p>
      )}
    </UrlSheet>
  )
}
```

`src/app/admin/ledger/page.tsx`. The Player cell's link sits under the row overlay, but ledger rows have no `rowLink`, so it stays clickable.
```tsx
import Link from 'next/link'

import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { SelectField } from '@/components/admin/select-field'
import { PointsAmount } from '@/components/points-amount'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { formatSort, type SearchParams } from '@/lib/table-params'
import { TX_TYPE_LABELS } from '@/lib/wallet'
import {
  LEDGER_TYPES,
  type LedgerListParams,
  type LedgerRow,
  listLedger,
  parseLedgerListParams,
} from '@/server/admin/tables/ledger'
import { requireAdmin } from '@/server/session'

const BASE = '/admin/ledger'

export default async function AdminLedgerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parseLedgerListParams(sp)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Ledger" />
      <FilterForm key={formKey} action={BASE} keep={{ sort: formatSort(params.sort) }}>
        <Field id="q" label="Username">
          <Input id="q" name="q" defaultValue={params.q ?? ''} className="w-40" />
        </Field>
        <SelectField
          id="type"
          name="type"
          label="Type"
          defaultValue={params.type ?? 'all'}
          options={[
            { value: 'all', label: 'All' },
            ...LEDGER_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABELS[t] })),
          ]}
        />
        <Field id="from" label="From (ET)">
          <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </Field>
        <Field id="to" label="To (ET)">
          <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </Field>
      </FilterForm>
      <LedgerTable sp={sp} params={params} />
    </>
  )
}

async function LedgerTable({ sp, params }: { sp: SearchParams; params: LedgerListParams }) {
  const result = await listLedger(params)
  return (
    <DataTable<LedgerRow>
      basePath={BASE}
      params={sp}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(t) => t.id}
      empty="No transactions."
      columns={[
        { key: 'time', header: 'Time', sort: 'time', cell: (t) => formatDateTime(t.createdAt) },
        {
          key: 'player',
          header: 'Player',
          cell: (t) => (
            <Link href={`/admin/players?player=${t.user.id}`} className="text-primary hover:underline">
              {t.user.username}
            </Link>
          ),
        },
        { key: 'type', header: 'Type', cell: (t) => TX_TYPE_LABELS[t.type] },
        {
          key: 'amount',
          header: 'Amount',
          sort: 'amount',
          align: 'right',
          cell: (t) => <PointsAmount value={t.amount} signed />,
        },
        {
          key: 'balanceAfter',
          header: 'Balance after',
          align: 'right',
          cell: (t) => <PointsAmount value={t.balanceAfter} />,
        },
        { key: 'note', header: 'Note', cell: (t) => t.note ?? '' },
      ]}
      footer={
        <tr>
          <td colSpan={3} className="px-3 py-2">
            Total for this filter
          </td>
          <td className="px-3 py-2 text-right">
            <PointsAmount value={result.totalAmount} signed />
          </td>
          <td colSpan={2} />
        </tr>
      }
    />
  )
}
```

Delete `src/app/admin/transactions/page.tsx`.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/integration/admin-details.test.ts tests/integration/admin-tables.test.ts tests/unit/admin-page-guards.test.ts tests/architecture.test.ts`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run `npm run dev -- -p 3005` as admin and check the following.
- `/admin/games`: the filters (team, status, ET from/to) and sorting work, and POSTPONED rows have an orange tint.
- Opening a game shows the heatmap and winners. Voiding asks for a reason, then confirmation, and refunds; the drawer then shows "Void: <reason>".
- Force sync shows a toast.
- `/admin/ledger`: the filters work, the totals row matches the filter, and clicking a player name opens the player drawer.

Stop the server.

- [ ] **Step 5: Commit**

Run `npm run check`, then:
```bash
git add -A src/server/admin/queries.ts src/app/admin/games src/app/admin/ledger src/app/admin/transactions tests/integration/admin-details.test.ts tests/unit/admin-page-guards.test.ts
git commit -m "feat: add admin games table with game drawer and ledger with totals"
```

---

### Task 15: Admin Support and Settings, admin redirects

**Files:**
- Create: `src/app/admin/support/page.tsx`, `src/app/admin/support/ticket-drawer.tsx`
- Modify: `src/app/admin/settings/page.tsx`, `src/server/inquiries.ts` (delete `listInquiriesAdmin`), `next.config.ts`, `tests/unit/redirects.test.ts`, `tests/integration/inquiries.test.ts`, `tests/unit/admin-page-guards.test.ts`
- Delete: `src/app/admin/inquiries/page.tsx`, `src/app/admin/inquiries/[id]/page.tsx`, `src/components/inquiry-thread.tsx`

**Interfaces:**
- Consumes:
  - from Task 6: `parseTicketListParams`, `listTickets`, `TICKET_STATUSES`, `TicketRow`, `parseAdminActionListParams`, `listAdminActions`, `AdminActionRow`, `ADMIN_ACTION_TYPES`;
  - from Task 10: `ChatThread` (viewer `ADMIN`), `FilterChips`;
  - existing: `getInquiryThread` (throws `DomainError NOT_FOUND`, which the drawer shows as "Not found"), `adminReplyAction` (sets ANSWERED), `adminCloseAction`, `referralBonusAction`.
- Routes:
  - `/admin/support?status=OPEN|ANSWERED|CLOSED&q&sort&page&ticket=<id>`;
  - `/admin/settings?action=<type>&page`.
- Redirects (permanent): `/admin/transactions` → `/admin/ledger`, `/admin/inquiries` → `/admin/support`, `/admin/inquiries/:id` → `/admin/support?ticket=:id`, `/admin/players/:id` → `/admin/players?player=:id`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/redirects.test.ts`, extend the expected list after `['/inquiries/:id', '/more/support/:id', true],`:
```ts
      ['/admin/transactions', '/admin/ledger', true],
      ['/admin/inquiries', '/admin/support', true],
      ['/admin/inquiries/:id', '/admin/support?ticket=:id', true],
      ['/admin/players/:id', '/admin/players?player=:id', true],
```

In `tests/unit/admin-page-guards.test.ts`, delete the `'admin/inquiries'` and `'admin/inquiries/[id]'` entries and add before `'admin/settings'`:
```ts
  ['admin/support', () => import('@/app/admin/support/page'), sp({ ticket: 'x' })],
```

Run: `npx vitest run tests/unit/redirects.test.ts tests/unit/admin-page-guards.test.ts`
Expected: FAIL — the four admin redirects are missing, and `@/app/admin/support/page` is missing.

- [ ] **Step 2: Implement**

`src/app/admin/support/ticket-drawer.tsx`:
```tsx
import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { ChatThread } from '@/components/support/chat-thread'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { getInquiryThread } from '@/server/inquiries'

import { adminCloseAction, adminReplyAction } from '../actions'

type Thread = Awaited<ReturnType<typeof getInquiryThread>>

export function TicketDrawer({ thread }: { thread: Thread }) {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        From{' '}
        <Link href={`/admin/players?player=${thread.userId}`} className="text-primary hover:underline">
          {thread.user.username}
        </Link>{' '}
        · <span className="font-semibold">{thread.status}</span>
      </p>
      <ChatThread messages={thread.messages} viewer="ADMIN" />
      {thread.status !== 'CLOSED' && (
        <div className="space-y-3">
          <ActionForm action={adminReplyAction.bind(null, thread.id)} submitLabel="Send reply" resetOnSuccess>
            <Label htmlFor="body">Reply</Label>
            <Textarea id="body" name="body" rows={4} maxLength={5000} required />
          </ActionForm>
          <ActionForm action={adminCloseAction.bind(null, thread.id)} submitLabel="Close ticket" />
        </div>
      )}
    </>
  )
}
```

`src/app/admin/support/page.tsx`:
```tsx
import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { FilterForm } from '@/components/admin/filter-form'
import { PageHeader } from '@/components/admin/page-header'
import { UrlSheet } from '@/components/admin/url-sheet'
import { FilterChips } from '@/components/filter-chips'
import { Input } from '@/components/ui/input'
import { DomainError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { firstParam } from '@/lib/pagination'
import { formatSort, isRecordId, type SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import {
  listTickets,
  parseTicketListParams,
  TICKET_STATUSES,
  type TicketListParams,
  type TicketRow,
} from '@/server/admin/tables/tickets'
import { getInquiryThread } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'

import { TicketDrawer } from './ticket-drawer'

const BASE = '/admin/support'

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const params = parseTicketListParams(sp)
  const drawerId = firstParam(sp.ticket)
  const formKey = JSON.stringify(params)
  return (
    <>
      <PageHeader title="Support" />
      <FilterChips
        label="Ticket status"
        chips={TICKET_STATUSES.map((s) => ({
          label: s,
          href: hrefWith(BASE, { q: params.q }, { status: s }),
          active: s === params.status,
        }))}
      />
      <div className="mt-3">
        <FilterForm
          key={formKey}
          action={BASE}
          keep={{ status: params.status, sort: formatSort(params.sort) }}
        >
          <Field id="q" label="Search subject or username">
            <Input id="q" name="q" defaultValue={params.q ?? ''} className="w-56" />
          </Field>
        </FilterForm>
      </div>
      <TicketsTable sp={sp} params={params} />
      {drawerId !== undefined && <TicketSheet sp={sp} id={drawerId} adminId={admin.id} />}
    </>
  )
}

async function TicketsTable({ sp, params }: { sp: SearchParams; params: TicketListParams }) {
  const result = await listTickets(params)
  return (
    <DataTable<TicketRow>
      basePath={BASE}
      params={{ ...sp, ticket: undefined }}
      sort={formatSort(params.sort)}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
      rows={result.rows}
      rowKey={(t) => t.id}
      rowLink={(t) => ({ href: hrefWith(BASE, sp, { ticket: t.id }), label: t.subject })}
      empty="Nothing here."
      columns={[
        { key: 'subject', header: 'Subject', cell: (t) => t.subject },
        { key: 'player', header: 'Player', cell: (t) => t.user.username },
        { key: 'messages', header: 'Messages', align: 'right', cell: (t) => t._count.messages },
        { key: 'created', header: 'Opened', sort: 'created', cell: (t) => formatDateTime(t.createdAt) },
        { key: 'updated', header: 'Updated', sort: 'updated', cell: (t) => formatDateTime(t.updatedAt) },
      ]}
    />
  )
}

async function TicketSheet({ sp, id, adminId }: { sp: SearchParams; id: string; adminId: string }) {
  // getInquiryThread throws NOT_FOUND for unknown ids: show "Not found" instead of an error page.
  const thread = isRecordId(id)
    ? await getInquiryThread(adminId, id).catch((e: unknown) => {
        if (e instanceof DomainError) return null
        throw e
      })
    : null
  return (
    <UrlSheet
      key={id}
      closeHref={hrefWith(BASE, sp, { ticket: undefined })}
      title={thread?.subject ?? 'Not found'}
    >
      {thread ? <TicketDrawer thread={thread} /> : <p className="text-muted-foreground">Ticket not found.</p>}
    </UrlSheet>
  )
}
```

`src/app/admin/settings/page.tsx` — replace:
```tsx
import { ActionForm } from '@/components/action-form'
import { DataTable } from '@/components/admin/data-table'
import { Field } from '@/components/admin/field'
import { PageHeader } from '@/components/admin/page-header'
import { FilterChips } from '@/components/filter-chips'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import type { SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import {
  type AdminActionListParams,
  type AdminActionRow,
  listAdminActions,
  parseAdminActionListParams,
} from '@/server/admin/tables/admin-actions'
import { ADMIN_ACTION_TYPES } from '@/server/audit'
import { requireAdmin } from '@/server/session'
import { getReferralBonus } from '@/server/settings'

import { referralBonusAction } from '../actions'

const BASE = '/admin/settings'

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const sp = await searchParams
  const params = parseAdminActionListParams(sp)
  const bonus = await getReferralBonus()

  return (
    <>
      <PageHeader title="Settings" />
      <Card className="mb-6 max-w-sm">
        <CardHeader>
          <CardTitle>Referral bonus</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={referralBonusAction} submitLabel="Save" className="grid gap-3">
            <Field id="referralBonus" label="Points paid to the referrer">
              <Input
                id="referralBonus"
                name="referralBonus"
                type="number"
                min={0}
                step={1}
                defaultValue={bonus}
                required
              />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
      <h2 className="mb-2 text-lg font-semibold">Admin action log</h2>
      <div className="mb-3">
        <FilterChips
          label="Action type"
          chips={[
            { label: 'All', href: BASE, active: params.action === undefined },
            ...ADMIN_ACTION_TYPES.map((a) => ({
              label: a,
              href: hrefWith(BASE, {}, { action: a }),
              active: params.action === a,
            })),
          ]}
        />
      </div>
      <ActionLog sp={sp} params={params} />
    </>
  )
}

async function ActionLog({ sp, params }: { sp: SearchParams; params: AdminActionListParams }) {
  const log = await listAdminActions(params)
  return (
    <DataTable<AdminActionRow>
      basePath={BASE}
      params={sp}
      sort="-time"
      page={log.page}
      pageCount={log.pageCount}
      total={log.total}
      rows={log.rows}
      rowKey={(a) => a.id}
      empty="No admin actions yet."
      columns={[
        { key: 'time', header: 'Time', cell: (a) => formatDateTime(a.createdAt) },
        { key: 'admin', header: 'Admin', cell: (a) => a.admin.username },
        { key: 'action', header: 'Action', cell: (a) => a.action },
        {
          key: 'target',
          header: 'Target',
          cell: (a) =>
            a.targetUser?.username ??
            (a.targetGame ? `${a.targetGame.awayTeam} @ ${a.targetGame.homeTeam}` : '—'),
        },
        {
          key: 'details',
          header: 'Details',
          cell: (a) => <span className="num text-muted-foreground text-xs">{JSON.stringify(a.details)}</span>,
        },
      ]}
    />
  )
}
```

`next.config.ts` — replace:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/referral', destination: '/more/referral', permanent: true },
      { source: '/inquiries', destination: '/more/support', permanent: true },
      { source: '/inquiries/:id', destination: '/more/support/:id', permanent: true },
      { source: '/admin/transactions', destination: '/admin/ledger', permanent: true },
      { source: '/admin/inquiries', destination: '/admin/support', permanent: true },
      { source: '/admin/inquiries/:id', destination: '/admin/support?ticket=:id', permanent: true },
      { source: '/admin/players/:id', destination: '/admin/players?player=:id', permanent: true },
    ]
  },
}

export default nextConfig
```

Then:
- Delete `src/app/admin/inquiries/page.tsx`, `src/app/admin/inquiries/[id]/page.tsx` and `src/components/inquiry-thread.tsx`.
- In `src/server/inquiries.ts`, delete `listInquiriesAdmin` and the now-unused `import type { InquiryStatus } from '@prisma/client'`.
- In `tests/integration/inquiries.test.ts`, delete the test `'lists inquiries for admins by status'` and `listInquiriesAdmin` from the import. `listTickets` (Task 6) covers it.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/unit/redirects.test.ts tests/unit/admin-page-guards.test.ts tests/integration/inquiries.test.ts tests/integration/admin-tables.test.ts tests/architecture.test.ts`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run `npm run dev -- -p 3005` as admin and check the following.
- `/admin/support` defaults to OPEN, and search by subject or username works.
- A ticket drawer shows the bubbles with Support on the right; Reply moves the ticket to ANSWERED (it leaves the OPEN tab) and Close closes it.
- `/admin/settings` saves the referral bonus (toast), and the action-type chips filter the log.
- `/admin/inquiries/<id>` lands on `/admin/support?ticket=<id>`, and `/admin/transactions` on `/admin/ledger`.

Stop the server.

- [ ] **Step 5: Commit**

Run `npm run check`, then:
```bash
git add -A src/app/admin src/components/inquiry-thread.tsx src/server/inquiries.ts next.config.ts tests
git commit -m "feat: add admin support inbox and settings log with admin redirects"
```

---

### Task 16: Error states, transition guard, E2E on desktop and iPhone 13, docs

**Files:**
- Create: `src/components/error-state.tsx`, plus `error.tsx` in `src/app/(player)/{games,games/[id],bets,wallet,more}/` and `src/app/admin/{,players,games,ledger,support,settings}/`, `tests/unit/route-states.test.ts`
- Modify: `src/app/globals.css` (delete the legacy class block), `playwright.config.ts`, `e2e/full-flow.spec.ts`, `README.md`, `docs/engineering/standards.md`

**Interfaces:**
- Consumes: everything in the E2E contract (Global Constraints) and `syncGames` / `ApiGame` (existing).
- Produces:
  - `<ErrorState error reset />` (client; logs the error, shows "Something went wrong" and a `Retry` button that calls `reset`);
  - Playwright projects `desktop` (Desktop Chrome) and `iphone` (iPhone 13 on Chromium).

- [ ] **Step 1: Write the failing test**

`tests/unit/route-states.test.ts` (Review Focus #5):
```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { listFiles } from '../architecture/rules'

const ROOT = path.resolve(__dirname, '..', '..')
const GROUPS = ['src/app/(player)', 'src/app/admin']
const pages = GROUPS.flatMap((g) => listFiles(g, /^page\.tsx$/))
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** The page's own folder, or a parent folder inside its group, holds `file`. */
function covered(page: string, file: string): boolean {
  const group = GROUPS.find((g) => page.startsWith(`${g}/`)) ?? ''
  for (let dir = path.dirname(page); dir.startsWith(group); dir = path.dirname(dir)) {
    if (existsSync(path.join(ROOT, dir, file))) return true
  }
  return false
}

describe('route segment states (spec §3.6)', () => {
  it('every page has an error.tsx (message + Retry)', () => {
    expect(pages.filter((p) => !covered(p, 'error.tsx'))).toEqual([])
  })

  // Next 15.5.29 production builds: a loading.tsx or <Suspense> boundary in a page makes client
  // transitions (search-param links, drawers, server-action refreshes) hang intermittently —
  // reproduced while planning the redesign. Pages render without streaming boundaries.
  it('uses no loading.tsx and no <Suspense> in pages', () => {
    expect(GROUPS.flatMap((g) => listFiles(g, /^loading\.tsx$/))).toEqual([])
    expect(pages.filter((p) => read(p).includes('<Suspense'))).toEqual([])
  })
})
```

Run: `npx vitest run tests/unit/route-states.test.ts`
Expected: FAIL — the error.tsx check lists every page; the no-loading check passes.

- [ ] **Step 2: Error states**

`src/components/error-state.tsx`:
```tsx
'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/** Body of every error.tsx: message + Retry (spec §3.6). */
export function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('route error', error)
  }, [error])
  return (
    <div role="alert" className="bg-card border-danger/50 mx-auto max-w-md rounded-xl border p-6 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        The page could not be loaded. {error.digest ? `(ref ${error.digest})` : ''}
      </p>
      <Button type="button" className="mt-4" onClick={reset}>
        Retry
      </Button>
    </div>
  )
}
```

Create the same three-line file at each of these paths:
- `src/app/(player)/games/error.tsx`, `src/app/(player)/games/[id]/error.tsx`, `src/app/(player)/bets/error.tsx`, `src/app/(player)/wallet/error.tsx`, `src/app/(player)/more/error.tsx`;
- `src/app/admin/error.tsx`, `src/app/admin/players/error.tsx`, `src/app/admin/games/error.tsx`, `src/app/admin/ledger/error.tsx`, `src/app/admin/support/error.tsx`, `src/app/admin/settings/error.tsx`.

```tsx
'use client'

import { ErrorState } from '@/components/error-state'

export default ErrorState
```

Run: `npx vitest run tests/unit/route-states.test.ts`
Expected: PASS.

- [ ] **Step 3: Remove the legacy classes**

Check that no page still uses them:
```bash
grep -rnE 'className="([^"]* )?(btn|btn-secondary|input|label|card|table)( [^"]*)?"' src --include=*.tsx || echo none
```
Expected: `none`. If anything is left, it is a leftover MVP page that an earlier task should have replaced; fix that first. Then delete the whole `/* Legacy MVP classes … */ @layer components { … }` block at the end of `src/app/globals.css`.

- [ ] **Step 4: Rewrite the E2E (desktop + iPhone 13)**

`playwright.config.ts` — replace:
```ts
import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name} (.env.test)`)
  return v
}

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 90_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // iPhone 13 viewport, touch and user agent on Chromium (CI installs Chromium only).
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100/login',
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: requireEnv('DATABASE_URL'),
      AUTH_SECRET: requireEnv('AUTH_SECRET'),
      AUTH_TRUST_HOST: 'true',
      CRON_SECRET: requireEnv('CRON_SECRET'),
      BALLDONTLIE_API_KEY: 'unused',
    },
  },
})
```

`e2e/full-flow.spec.ts` — replace. Each project runs against the same database, so usernames and the game `externalId` are tagged with the project name.
- The admin opens bob's drawer by **clicking the row** and waits for the `Points updated` toast after the action refresh (Review Focus #5).
- The iPhone run opens the slip through the floating bar.
```ts
import { expect, type Page, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import type { ApiGame } from '../src/server/sync/balldontlie'
import { syncGames } from '../src/server/sync/sync'

async function signup(page: Page, username: string, ref?: string) {
  await page.goto(ref ? `/signup?ref=${ref}` : '/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL('**/games')
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** Players log out from More; admins from the console header (on a page with no drawer open). */
async function logout(page: Page, from: 'player' | 'admin') {
  await page.goto(from === 'player' ? '/more' : '/admin')
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL('**/login')
}

test('referral → admin grant in drawer → slip bet → auto-settle → payout', async ({ page }, testInfo) => {
  // Each project (desktop, iphone) runs against the same database: keep its users and game apart.
  const tag = testInfo.project.name
  const alice = `alice_${tag}`
  const bob = `bob_${tag}`
  const externalId = tag === 'desktop' ? 7001 : 7002
  const mobile = testInfo.project.use.isMobile === true

  // alice signs up and shares her code
  await signup(page, alice)
  await page.goto('/more/referral')
  const code = (await page.getByTestId('referral-code').textContent())?.trim() ?? ''
  expect(code).not.toBe('')
  await logout(page, 'player')

  // a logged-in visitor to /login is sent home (spec §4.7) — checked with bob below
  await signup(page, bob, code)
  await page.goto('/login')
  await page.waitForURL('**/games')
  await logout(page, 'player')
  const aliceRow = await prisma.user.findUniqueOrThrow({ where: { usernameKey: alice } })
  expect(aliceRow.balance).toBe(500)

  // admin grants bob 1000 from the player drawer
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto(`/admin/players?q=${bob}`)
  await page.getByRole('link', { name: bob, exact: true }).click()
  await expect(page.getByRole('dialog', { name: bob })).toBeVisible()
  await page.getByRole('button', { name: 'Grant', exact: true }).click()
  await page.getByLabel('Amount').fill('1000')
  await page.getByLabel('Note').fill('Welcome bonus')
  await page.getByRole('button', { name: 'Grant points', exact: true }).click()
  await expect(page.getByText('Points updated')).toBeVisible()
  await logout(page, 'admin')

  // a game exists; bob picks 9-6 with the pickers, adds it to the slip and confirms
  const game = await prisma.game.create({
    data: {
      externalId,
      startsAt: new Date(Date.now() + 2 * 3600_000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    },
  })
  await login(page, bob, 'secret123')
  await page.waitForURL('**/games')
  await page.goto(`/games/${game.id}`)
  await page.getByRole('button', { name: 'LAL digit 9' }).click()
  await page.getByRole('button', { name: 'GSW digit 6' }).click()
  await page.getByRole('button', { name: 'Add to slip', exact: true }).click()
  if (mobile) await page.getByRole('button', { name: /^Open bet slip/ }).click()
  await page.getByRole('button', { name: 'Confirm bets' }).click()
  await expect(page.getByText('1 bet placed')).toBeVisible()

  // the API reports the game final: LAL 99 @ GSW 106 → ending 9-6
  const final: ApiGame = {
    id: externalId,
    date: '2026-11-11',
    datetime: game.startsAt.toISOString(),
    status: 'Final',
    period: 4,
    home_team_score: 106,
    visitor_team_score: 99,
    home_team: { abbreviation: 'GSW' },
    visitor_team: { abbreviation: 'LAL' },
  }
  const result = await syncGames({ fetchGames: async () => [final] })
  expect(result.settled).toBe(1)

  // bob: 1000 - 100 + 90 (sole winner gets 90% of a 100 pool)
  await page.goto('/wallet')
  await expect(page.getByTestId('balance')).toHaveText('990 pts')
  await expect(page.getByText('Payout', { exact: true })).toBeVisible()
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
```

- [ ] **Step 5: Run the E2E twice**

```bash
npm run test:e2e
npm run test:e2e
```
Expected: `2 passed` both times (desktop and iphone). The second run checks for the intermittent same-route hang described in Global Constraints. If a drawer click or the Grant toast times out, look for a `loading.tsx` or `<Suspense>` that slipped in before looking anywhere else.

- [ ] **Step 6: Docs**

In `README.md`, replace the `## Tests` section with:
````markdown
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
````

In `docs/engineering/standards.md`, §3 Principles, add after the `- **UI.** …` bullet:
```markdown
- **No streaming boundaries in pages.** Do not add `loading.tsx` or a page-level `<Suspense>`: on Next 15.5 they make same-route transitions (search-param links, drawers, action refreshes) hang intermittently in production builds. `tests/unit/route-states.test.ts` enforces this; revisit after a Next upgrade.
```

- [ ] **Step 7: Final verification**

```bash
npm run check
npm run build
```
Expected: everything passes, and the build lists every route as dynamic (`ƒ`).

Manual pass with `npm run dev -- -p 3005`, at 390px and at desktop width:
- signup with `?ref=` → admin Grant via the drawer → the player picks 9-6 with the pickers → Add to slip → Confirm.
- An invalid `?date=`, `?page=`, `?sort=` and `?player=` never error.
- Tab through the game screen: every control has a visible accent focus ring.

Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/error-state.tsx src/app src/app/globals.css playwright.config.ts e2e README.md docs/engineering/standards.md tests/unit/route-states.test.ts
git commit -m "test: cover redesigned flows on desktop and iPhone, add error states"
```
