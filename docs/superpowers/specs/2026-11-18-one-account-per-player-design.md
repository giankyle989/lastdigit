# One account per player

Date: 2026-11-18 · Status: design approved in chat, awaiting spec review

## 1. Goal

Make a second account per person useless, and make the casual attempts visible to admins.

With bonuses off, the only way to get points is a top-up that an admin grants by hand. If a
top-up requires a phone number that is unique and confirmed by the admin, an extra account
has no points and cannot bet. Device and network flags catch people who make extra accounts
on the same device or Wi-Fi, so an admin can look closer.

**Decided with the product owner:**

- Option 1: one unique PH mobile number per account, entered at signup, confirmed by an admin
  once before the first grant.
- Option 4: record a device ID and the real client IP at signup and login; flag accounts that
  share them. Flags never block anyone; the admin decides.
- Grants are blocked until the phone is confirmed (not just shown, not confirmed every grant).
- Fix the client-IP spoofing gap in the signup rate limit as part of this.

**Out of scope:** SMS codes, ID checks, blocking shared devices automatically, recording
sightings on every request, a player-facing way to change the number.

## 2. Phone number

### 2.1 Format

- Accepted input: `09XXXXXXXXX`, `9XXXXXXXXX`, `639XXXXXXXXX` or `+639XXXXXXXXX`, with spaces
  and dashes ignored. Anything else → "Enter a PH mobile number, e.g. 0917 123 4567".
- Stored normalised as `+639XXXXXXXXX` (E.164), so one number has one spelling.
- Shown to admins as `0917 123 4567`.
- `parsePhPhone(input): string | null` in `src/lib/phone.ts` (pure) does both checks.

### 2.2 Signup

- The signup form gets a required **Mobile number** field (`type="tel"`,
  `autocomplete="tel"`, `inputmode="tel"`), between Username and Password.
- `registerPlayer` validates it with zod via `parsePhPhone`. A number already used by any
  account → "This number is already registered." The database enforces it too (unique
  column), so two signups racing with the same number cannot both succeed.
- Admin accounts have no phone (the column is nullable).

### 2.3 Admin player drawer

- **Phone** row: the number, and its state: **Not confirmed** or **Confirmed on {date} by
  {admin}**. Shows "No number" for accounts created before this feature.
- **Edit number** (dialog): sets or changes the number; same validation and uniqueness as
  signup. Saving clears the confirmation. Audited as `UPDATE_PHONE` with old and new number.
- **Confirm phone** (button, shown while unconfirmed and a number is set): the admin has
  matched it to the GCash number or chat the top-up came from. Sets `phoneConfirmedAt` and
  `phoneConfirmedById`. Audited as `CONFIRM_PHONE`.
- **Grant** is disabled while the phone is unconfirmed, with the hint "Confirm the phone number
  first". `adjustPoints` enforces it on the server too: a GRANT for an unconfirmed player fails
  with `PHONE_NOT_CONFIRMED`. **Deduct** is never blocked.
- Players cannot change their number; they ask support.

## 3. Device and network flags

### 3.1 Real client IP

Today the IP comes from `x-forwarded-for`. Next.js fills that header from the socket only when
the request does not already carry one, so any client can fake it and bypass the signup rate
limit.

- A small custom server, `server.js` at the repo root, wraps Next.js. For each request it
  deletes any incoming `x-lastdigit-client-ip` header and sets it from
  `req.socket.remoteAddress`. With `TRUSTED_PROXY=1` (for a future HTTPS proxy in front) it
  uses the right-most `x-forwarded-for` entry instead, which the proxy adds.
- `clientIp()` in `src/server/request-info.ts` reads only `x-lastdigit-client-ip`; it falls
  back to `'unknown'` (dev server, tests).
- `lastdigit.service` runs `node server.js` instead of `next start`; the same host and port
  flags move to env (`HOST=0.0.0.0`, `PORT=3000`). `npm start` does the same. The e2e web
  server keeps `next dev`/`next start` and gets `'unknown'`, which is fine for its checks.
- The signup rate limit uses this IP.

### 3.2 Device ID

- Cookie `ld_device`: 128-bit random, base64url; `httpOnly`, `SameSite=Lax`, `Secure` when
  served over HTTPS, `Path=/`, max-age 2 years.
- Set by the login and signup actions when missing (server actions can set cookies). There is
  no middleware.

### 3.3 Sightings

New table `AccountSighting`:

| Column        | Notes                                                  |
| ------------- | ------------------------------------------------------ |
| `id`          | cuid                                                   |
| `userId`      | the account                                            |
| `kind`        | `DEVICE` or `NETWORK`                                  |
| `fingerprint` | HMAC-SHA256 of the device ID or IP, keyed by `AUTH_SECRET`, hex |
| `firstSeenAt` | first time this account was seen with it               |
| `lastSeenAt`  | updated on each later sighting                         |

Unique on (`userId`, `kind`, `fingerprint`); index on (`kind`, `fingerprint`).

- Recorded after a successful signup and after each successful login (players and admins
  alike; admin rows are ignored by the flags). An `'unknown'` IP is not recorded.
- Raw device IDs and IPs are never stored. The hash is enough to find matches and keeps
  personal data out of the database (PH Data Privacy Act).
- Recording failures are logged and never block signup or login.

### 3.4 Where admins see it

- **Player drawer → Linked accounts:** other player accounts that share a fingerprint with this
  one, each with "same device" and/or "same network", linking to that player's drawer. Hidden
  when there are none.
- **Admin overview → Needs attention:** "N players share a device with another account",
  linking to the players list filtered to them (`/admin/players?flag=shared-device`). Shared
  networks are left out here: home Wi-Fi and mobile carriers make them common.
- **Players list:** a small "Shared device" badge on flagged rows, and the
  `flag=shared-device` filter.

## 4. Code changes

| File                                     | Change                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` + migration       | `User.phone String? @unique`, `phoneConfirmedAt DateTime?`, `phoneConfirmedById String?`; `AccountSighting` model; `SightingKind` enum |
| `src/lib/phone.ts` (new)                 | `parsePhPhone`, `formatPhPhone`                                                         |
| `src/server/users.ts`                    | `registerPlayer` takes and validates `phone`; unique violation → `PHONE_TAKEN`           |
| `src/server/admin/players.ts`            | `setPhone`, `confirmPhone` (audited); `adjustPoints` GRANT requires a confirmed phone     |
| `src/server/sightings.ts` (new)          | `recordSighting(userId, { deviceId, ip })`, `linkedAccounts(userId)`, `sharedDeviceCount()` |
| `src/server/request-info.ts` (new)       | `clientIp()` and `deviceId()` (reads or creates the cookie)                             |
| `server.js` (new)                        | custom server setting `x-lastdigit-client-ip`                                           |
| `src/app/(auth)/actions.ts`, signup form | phone field; real IP for the rate limit; record sightings                               |
| `src/app/admin/players/*`, `src/app/admin/page.tsx` | phone row, edit/confirm, Grant gating, linked accounts, badge, filter, Needs attention item |
| `src/server/admin/overview.ts`           | shared-device count in the overview and admin badges                                    |
| `package.json`, `lastdigit.service`, `.env.example` | `start` runs `node server.js`; `TRUSTED_PROXY` documented                     |

Every new admin action calls `requireAdmin()` and validates input with zod. Confirmation,
phone edits and grants run in transactions as today.

## 5. Errors and edge cases

- **Duplicate number at signup or edit:** "This number is already registered." Nothing saved.
- **Number edited after confirmation:** confirmation cleared; Grant blocked until confirmed again.
- **Existing accounts without a number:** can log in and bet with points they already have;
  cannot receive a grant until an admin adds and confirms a number.
- **Cookies blocked:** no device sighting is recorded; network sighting still is.
- **Many accounts on one public network** (school, carrier NAT): they show "same network" in the
  drawer only, never in Needs attention.
- **Admin accounts** are recorded but never listed as linked accounts or counted.

## 6. Testing

- **Unit:** `parsePhPhone` and `formatPhPhone` (each accepted form, spaces and dashes, wrong
  prefix, wrong length, landlines); client-IP selection with and without `TRUSTED_PROXY`, and
  that an incoming `x-lastdigit-client-ip` is overwritten.
- **Integration (real Postgres):** duplicate phone refused (also across two spellings);
  concurrent signups with one number → exactly one succeeds; GRANT blocked until confirmed,
  DEDUCT allowed; editing the number clears confirmation; confirm and edit are audited;
  sightings upsert (first/last seen); linked accounts by device and by network; admins
  excluded; shared-device count.
- **E2E (desktop and iPhone):** signup with a mobile number; admin sees Grant disabled,
  confirms the phone, then grants.
