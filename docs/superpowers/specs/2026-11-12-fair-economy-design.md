# Fair economy rules

Supersedes parts of `2026-11-11-lastdigit-design.md` §4.3 (settlement) and §5 (points sources).

## Problems
1. A pool with one player, or with every stake on the winning ending, paid winners 90% of their own money: a "win" that loses points.
2. New players needed a reason to top up; a flat signup bonus was judged too generous for the starting phase.
3. The referral bonus was paid at signup, so alt accounts farmed unlimited points.
4. House take is destroyed, and points only entered through referrals and grants, so balances drained.

## Rules
- **Refunded pools.** At settlement, if fewer than 2 distinct players bet on the game, or no stake is on a losing ending, every bet is refunded (`REFUND`, bet `REFUNDED`), `houseTake = 0`. A pool where nobody wins (2+ players) still goes to the house.
- **Winner floor.** Payout pool = max(floor(90% × pool), winning stake), split pro-rata. A winner never gets back less than their stake; the house take shrinks to cover it. `estimatePayout` uses the same formula.
- **Welcome bonus (first top-up match).** Players start at 0. A player's first admin grant (their first top-up) is matched 1:1 as `SIGNUP_BONUS`, up to `welcomeBonusCap` (default 1000; 0 = off). Later grants aren't matched; players who already had a grant before this change get no match.
- **Referral bonus on the first top-up.** When a referred player gets their first admin grant (first top-up), the referrer gets `referralPercent`% of it (default 50%), up to `referralBonusCap` (default 500), as `REFERRAL_BONUS`. `User.referralBonusPaidAt` makes it once-only; existing referred players are backfilled as paid (their referrer was paid at signup under the old rule). Settlement pays no referral bonus. While the percent or cap is 0 nothing is paid.
- **Daily bonus.** Off by default (`dailyBonus` = 0) for the starting phase. When set above 0, a player can claim it once per PHT calendar day from the wallet (`DAILY_BONUS`, `User.lastDailyBonusOn`).
- **Signup rate limit.** At most `SIGNUP_LIMIT_PER_HOUR` (default 5) accounts per client IP per hour, in memory per server process.
- All bonus settings are edited together on Admin → Settings (one `UPDATE_SETTING` audit entry).

## Locking
Settlement locks every bettor up front, in ascending id order (`lockUsers`). A grant locks the player and their referrer the same way.
