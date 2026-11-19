import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { adjustBalance, confirmPhone } from '../src/server/admin/players'
import { login, logout, signup } from './helpers'

test('staff give and take points; a bet spends points first, then the wallet', async ({ page }, testInfo) => {
  const tag = testInfo.project.name
  const carol = `carol_${tag}`
  const mobile = testInfo.project.use.isMobile === true
  const phone = tag === 'desktop' ? '0917 000 0401' : '0917 000 0402'
  const externalId = tag === 'desktop' ? 7201 : 7202

  await signup(page, carol, phone)
  await logout(page, 'player')

  // carol's first cash in (whatever welcome bonus is configured), then her points are emptied
  const admin = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'admin' } })
  const row = await prisma.user.findUniqueOrThrow({ where: { usernameKey: carol } })
  await confirmPhone(admin.id, row.id)
  await adjustBalance(admin.id, row.id, { kind: 'CASH_IN', amount: 200, note: 'top-up' })
  const afterCashIn = await prisma.user.findUniqueOrThrow({ where: { id: row.id } })
  if (afterCashIn.pointsBalance > 0) {
    await adjustBalance(admin.id, row.id, {
      kind: 'TAKE_POINTS',
      amount: afterCashIn.pointsBalance,
      note: 'reset',
    })
  }

  // staff give 50 points, then take 10, from the drawer
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto(`/admin/players?player=${row.id}`)
  await page.getByRole('button', { name: 'Give points', exact: true }).click()
  await page.getByLabel('Amount').fill('50')
  await page.getByLabel('Note').fill('promo')
  await page.getByRole('button', { name: 'Add points', exact: true }).click()
  await expect(page.getByText('Points given')).toBeVisible()
  await page.getByRole('button', { name: 'Take points', exact: true }).click()
  await page.getByLabel('Amount').fill('10')
  await page.getByLabel('Note').fill('correction')
  await page.getByRole('button', { name: 'Remove points', exact: true }).click()
  await expect(page.getByText('Points taken')).toBeVisible()
  const beforeBet = await prisma.user.findUniqueOrThrow({ where: { id: row.id } })
  expect([beforeBet.walletBalance, beforeBet.pointsBalance]).toEqual([200, 40])
  await logout(page, 'admin')

  // carol bets 100 on one ending: 40 points + 60 wallet
  const game = await prisma.game.create({
    data: {
      externalId,
      startsAt: new Date(Date.now() + 2 * 3600_000),
      awayTeam: 'LAL',
      homeTeam: 'GSW',
      status: 'SCHEDULED',
    },
  })
  await login(page, carol, 'secret123')
  await page.waitForURL('**/games')
  await page.goto(`/games/${game.id}`)
  await page.getByRole('button', { name: 'LAL digit 1' }).click()
  await page.getByRole('button', { name: 'GSW digit 2' }).click()
  await page.getByRole('button', { name: 'Add to slip', exact: true }).click()
  if (mobile) await page.getByRole('button', { name: /^Open bet slip/ }).click()
  await expect(page.getByTestId('slip-funding').filter({ visible: true })).toHaveText(
    'Uses 40 points + 60 wallet',
  )
  await page.getByRole('button', { name: 'Confirm bets' }).click()
  await expect(page.getByText('1 bet placed')).toBeVisible()

  await page.goto('/wallet')
  await expect(page.getByTestId('wallet-balance')).toHaveText('140 pts')
  await expect(page.getByTestId('points-balance')).toHaveText('0 pts')
  // the header's accessible name starts with the visible total, then the split
  await expect(page.getByRole('link', { name: '140 pts (wallet 140, points 0)', exact: true })).toBeVisible()
  // the bet appears as one row per account, tagged Points and Wallet
  await expect(page.getByRole('listitem').filter({ hasText: /^BetPoints/ })).toHaveCount(1)
  await expect(page.getByRole('listitem').filter({ hasText: /^BetWallet/ })).toHaveCount(1)

  // the balance cards must fit the viewport (checked on the narrow iPhone project too)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
