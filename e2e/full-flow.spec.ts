import { expect, type Page, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { placeBet } from '../src/server/bets'
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

test('signup bonus → referral → admin grant → daily bonus → slip bet → settle → payout + referral bonus', async ({
  page,
}, testInfo) => {
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
  // both start with the 1000-point welcome bonus; alice's referral bonus waits for bob's first settled bet
  const aliceRow = await prisma.user.findUniqueOrThrow({ where: { usernameKey: alice } })
  expect(aliceRow.balance).toBe(1000)

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
  // alice is also in the pool (on a losing ending), so it is not a solo pool
  await placeBet(aliceRow.id, { gameId: game.id, awayDigit: 1, homeDigit: 1, stake: 100 })

  await login(page, bob, 'secret123')
  await page.waitForURL('**/games')

  // bob claims today's daily bonus from the wallet
  await page.goto('/wallet')
  await page.getByRole('button', { name: 'Claim', exact: true }).click()
  await expect(page.getByText('+100 pts daily bonus')).toBeVisible()
  await expect(page.getByText(/Claimed today/)).toBeVisible()

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

  // bob: 1000 welcome + 1000 grant + 100 daily - 100 stake + 180 (sole winner: 90% of a 200 pool)
  await page.goto('/wallet')
  await expect(page.getByTestId('balance')).toHaveText('2,180 pts')
  await expect(page.getByText('Payout', { exact: true })).toBeVisible()

  // bob's first settled bet pays alice the referral bonus: 1000 - 100 + 500
  const aliceAfter = await prisma.user.findUniqueOrThrow({ where: { usernameKey: alice } })
  expect(aliceAfter.balance).toBe(1400)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
