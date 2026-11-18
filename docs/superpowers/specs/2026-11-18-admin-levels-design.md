# Admin levels: superadmin and managers

Date: 2026-11-18 · Status: design approved in chat, awaiting spec review

## 1. Goal

Let the owner hand day-to-day work (cash in, cash out, bonus points, player care, support) to
managers. Game control, settings and staff stay with the superadmin.

**Decided with the product owner:**

- Two staff levels: **superadmin** (everything) and **manager**.
- Managers: cash in and cash out, give and deduct bonus points, confirm or edit phone numbers,
  suspend and unsuspend players, reset player passwords, set stake limits, answer and close
  support tickets, and view the overview, players, ledger and games.
- Superadmin only: void and resync games, settings, and the staff page.

**Out of scope:** per-person custom permissions; managers changing their own password (a
superadmin resets it); more than two staff levels. The wallet/points split is a separate spec;
this one gates today's Grant and Deduct, and the next spec reuses the same permissions.

## 2. Roles

- `enum Role` becomes `PLAYER`, `MANAGER`, `SUPERADMIN`.
- Migration: `ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPERADMIN'` and
  `ALTER TYPE "Role" ADD VALUE 'MANAGER'`. Existing admins (today only `admin`) become
  superadmins; no data is copied.
- `prisma/seed.ts` seeds the `ADMIN_USERNAME` account as `SUPERADMIN`. The env names stay.
- "Staff" means `MANAGER` or `SUPERADMIN`. Everywhere the code asks "is this an admin?" today
  (home redirect, player header's admin link, support thread author label, inquiry access) it
  asks "is this staff?" instead. Raw SQL that filters `role = 'PLAYER'` stays as is.

## 3. Permissions

One pure table in `src/lib/permissions.ts`:

| Permission         | Covers                                                                     | Manager | Superadmin |
| ------------------ | -------------------------------------------------------------------------- | :-----: | :--------: |
| `console.view`     | overview, players, ledger, games (read), support list                       |    ✓    |     ✓      |
| `points.adjust`    | Grant and Deduct (cash in, cash out, bonus points)                          |    ✓    |     ✓      |
| `players.manage`   | confirm/edit phone, suspend/unsuspend, reset password, stake limit          |    ✓    |     ✓      |
| `support.answer`   | reply to and close tickets                                                 |    ✓    |     ✓      |
| `games.manage`     | void a game, force resync                                                  |         |     ✓      |
| `settings.manage`  | settings page (bonuses)                                                    |         |     ✓      |
| `staff.manage`     | staff page                                                                 |         |     ✓      |

- `can(role, permission): boolean` and `isStaff(role): boolean`. Pure, unit-tested for every
  cell.
- **Pages and actions:** `requireAdmin(permission = 'console.view')` in `src/server/session.ts`
  lets any staff member in and then checks the permission. No staff role → redirect `/`;
  staff without the permission → redirect `/admin`. Every page and action keeps calling it
  itself with the permission it needs.
- **Server functions:** the superadmin-only ones (`voidGame`, `setBonuses`, all staff
  functions) load the actor and throw `FORBIDDEN` when `can()` says no, so a manager cannot
  reach them by calling the function another way. Resync is the exception: `syncGames` is also
  run by the 5-minute scheduler with no actor, so `forceSyncAction` alone checks
  `games.manage`.
  Manager-level functions (`adjustPoints`, `setPhone`, `confirmPhone`, `suspendPlayer`, …,
  inquiry replies) check `isStaff` on the actor the same way.
- **UI:** controls and nav items a manager cannot use are hidden, not disabled: Void and Resync
  on the games pages, the Settings and Staff nav items. The admin nav takes the viewer's role.

## 4. Staff page

`/admin/staff`, `staff.manage` only.

- Table of staff accounts: username, role, status (Active / Disabled), last seen (latest
  `AccountSighting.lastSeenAt`, or "Never").
- **Add manager** (dialog): username and temporary password, same validation as signup
  (username rules, password length). Creates a `MANAGER` with no phone and no referral use.
  Audited `CREATE_STAFF`.
- **Disable / Enable** a manager: sets `status = SUSPENDED` with no end date / back to `ACTIVE`,
  the same fields player suspension uses, so a disabled manager is signed out on the next
  request (sessions load the user fresh). Audited `DISABLE_STAFF` / `ENABLE_STAFF`.
- **Reset password** for a manager. Audited `RESET_STAFF_PASSWORD` (the password is never
  logged).
- **Guards:** staff actions apply to managers only. Nobody can disable, reset or change another
  superadmin or themselves from this page, so the last superadmin can never be locked out.
  Promoting a manager to superadmin is not offered (seed or database only).

Staff accounts never appear in the players list, player counts, linked accounts or shared-device
flags (unchanged: those already filter on `PLAYER`).

## 5. Code changes

| File                                            | Change                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `prisma/schema.prisma` + migration              | `Role` = `PLAYER`, `MANAGER`, `SUPERADMIN`                              |
| `prisma/seed.ts`                                | seed `SUPERADMIN`                                                      |
| `src/lib/permissions.ts` (new)                  | permission table, `can`, `isStaff`                                     |
| `src/lib/errors.ts`                             | new `FORBIDDEN` code                                                   |
| `src/server/session.ts`                         | `requireAdmin(permission?)`                                            |
| `src/server/staff.ts` (new)                     | `listStaff`, `createManager`, `setStaffDisabled`, `resetStaffPassword` |
| `src/server/settlement.ts`, `settings.ts`, `admin/players.ts`, `inquiries.ts` | actor permission checks |
| `src/server/audit.ts`                           | the four staff audit actions                                           |
| `src/app/admin/**`                              | permission per page/action; hide Void/Resync; staff page and actions   |
| `src/components/admin/admin-nav.tsx`           | nav filtered by role                                                   |
| `src/app/page.tsx`, `(player)/layout.tsx`, `components/support/chat-thread.tsx` | staff instead of `'ADMIN'` |
| tests                                           | `role: 'ADMIN'` → `'SUPERADMIN'`; new tests below                      |

## 6. Errors and edge cases

- **Manager opens `/admin/settings` or `/admin/staff` by URL:** redirected to `/admin`.
- **Manager posts a superadmin action directly:** the action redirects; the server function
  throws `FORBIDDEN` if reached another way. Nothing changes.
- **Manager disabled while logged in:** next request signs them out.
- **Duplicate username on Add manager:** "That username is taken." (same rule as signup).
- **Superadmin tries to disable themselves or another superadmin:** not offered in the UI;
  server refuses with `FORBIDDEN`.
- **Audit log** already records which staff member did each action; it now shows managers too.

## 7. Testing

- **Unit:** `can()` for every permission × role (including `PLAYER` → always false);
  `isStaff`.
- **Integration (real Postgres):** manager allowed: grant, deduct, suspend, reset password,
  stake limit, phone confirm, support reply; manager refused (`FORBIDDEN`): void, bonus
  settings, every staff function; staff: create manager (and duplicate username),
  disable → `isSuspended`, enable, reset password, audit rows; cannot target a superadmin or
  self.
- **E2E (desktop and iPhone):** superadmin adds a manager on the staff page; the manager logs
  in, sees no Settings/Staff nav and no Void on a game, and grants points to a player.
