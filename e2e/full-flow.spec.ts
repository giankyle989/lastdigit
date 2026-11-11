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

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL('**/login')
}

test('referral → admin grant → bet → auto-settle → payout', async ({ page }) => {
  // alice signs up and shares her code
  await signup(page, 'alice')
  await page.goto('/referral')
  const code = (await page.getByTestId('referral-code').textContent())?.trim() ?? ''
  expect(code).not.toBe('')
  await logout(page)

  // bob signs up with alice's code; alice gets 500
  await signup(page, 'bob', code)
  await logout(page)
  const alice = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'alice' } })
  expect(alice.balance).toBe(500)

  // admin grants bob 1000
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto('/admin/players?q=bob')
  await page.getByRole('link', { name: 'bob' }).click()
  await page.getByLabel('Direction').selectOption('GRANT')
  await page.getByLabel('Amount').fill('1000')
  await page.getByLabel('Note').fill('Welcome bonus')
  await page.getByRole('button', { name: 'Apply points' }).click()
  await expect(page.getByText('Points updated')).toBeVisible()
  await logout(page)

  // a game exists; bob bets 100 on 9-6
  const game = await prisma.game.create({
    data: {
      externalId: 777,
      startsAt: new Date(Date.now() + 2 * 3600_000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    },
  })
  await login(page, 'bob', 'secret123')
  await page.waitForURL('**/games')
  await page.goto(`/games/${game.id}`)
  await page.getByRole('button', { name: 'Ending 9-6' }).click()
  await page.getByLabel('Stake').fill('100')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByText('Bet placed')).toBeVisible()

  // the API reports the game final: LAL 99 @ GSW 106 → ending 9-6
  const final: ApiGame = {
    id: 777,
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
  await expect(page.getByRole('cell', { name: 'PAYOUT' })).toBeVisible()
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
