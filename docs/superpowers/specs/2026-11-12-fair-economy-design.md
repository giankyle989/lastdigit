# Fair economy rules

Supersedes parts of `2026-11-11-lastdigit-design.md` §4.3 (settlement) and §5 (points sources).

## Problems
1. A pool with one player, or with every stake on the winning ending, paid winners 90% of their own money: a "win" that loses points.
2. New players started at 0 and could not play until an admin granted points.
3. The referral bonus was paid at signup, so alt accounts farmed unlimited points.
4. House take is destroyed, and points only entered through referrals and grants, so balances drained.

## Rules
- **Refunded pools.** At settlement, if fewer than 2 distinct players bet on the game, or no stake is on a losing ending, every bet is refunded (`REFUND`, bet `REFUNDED`), `houseTake = 0`. A pool where nobody wins (2+ players) still goes to the house.
- **Winner floor.** Payout pool = max(floor(90% × pool), winning stake), split pro-rata. A winner never gets back less than their stake; the house take shrinks to cover it. `estimatePayout` uses the same formula.
- **Signup bonus.** Every new player gets `signupBonus` (default 1000) as `SIGNUP_BONUS`.
- **Referral bonus, deferred.** The referrer gets `referralBonus` (default 500) when the referred player's first bet settles as WON or LOST (refunded pools don't count). `User.referralBonusPaidAt` makes it once-only; existing referred players are backfilled as paid. While the bonus is 0 nothing is paid or marked.
- **Daily bonus.** A player can claim `dailyBonus` (default 100; 0 = off) once per PHT calendar day from the wallet (`DAILY_BONUS`, `User.lastDailyBonusOn`).
- **Signup rate limit.** At most `SIGNUP_LIMIT_PER_HOUR` (default 5) accounts per client IP per hour, in memory per server process.
- All three bonuses are edited together on Admin → Settings (one `UPDATE_SETTING` audit entry).

## Locking
Settlement locks every user it will credit (bettors and referrers) up front, in ascending id order (`lockUsers`).
