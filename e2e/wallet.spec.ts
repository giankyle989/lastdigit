import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { adjustBalance, confirmPhone } from '../src/server/admin/players'
import { login, logout, payFrom, signup } from './helpers'

test('staff give and take points; a slip is paid from points or from the wallet, as chosen', async ({
  page,
}, testInfo) => {
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

  // carol bets 30 from points, then 60 from the wallet, on one ending each
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

  const addEnding = async (away: number, home: number) => {
    await page.getByRole('button', { name: `LAL digit ${away}` }).click()
    await page.getByRole('button', { name: `GSW digit ${home}` }).click()
    await page.getByRole('button', { name: 'Add to slip', exact: true }).click()
    if (mobile) await page.getByRole('button', { name: /^Open bet slip/ }).click()
  }
  const closeSlip = async () => {
    if (mobile) await page.keyboard.press('Escape')
  }

  await addEnding(1, 2)
  const stakeInput = page.getByLabel('Stake for LAL @ GSW 1-2', { exact: true }).filter({ visible: true })
  const maxButton = page
    .getByRole('button', { name: 'Max stake for LAL @ GSW 1-2' })
    .filter({ visible: true })
  // Max follows the chosen balance: the whole wallet, then (after switching) the whole points balance
  await payFrom(page, 'Wallet')
  await maxButton.click()
  await expect(stakeInput).toHaveValue('200')
  await payFrom(page, 'Points')
  await expect(
    page.getByRole('alert').filter({ hasText: 'Not enough' }).filter({ visible: true }),
  ).toContainText('Not enough points (40 pts).')
  await expect(page.getByRole('button', { name: 'Confirm bets' })).toBeDisabled()
  await maxButton.click()
  await expect(stakeInput).toHaveValue('40')
  await stakeInput.fill('30')
  await payFrom(page, 'Points')
  // too much from points: blocked, with the offer to switch
  await stakeInput.fill('100')
  await expect(
    page.getByRole('alert').filter({ hasText: 'Not enough' }).filter({ visible: true }),
  ).toContainText('Not enough points (40 pts).')
  await expect(
    page.getByRole('button', { name: 'Pay from Wallet instead' }).filter({ visible: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm bets' })).toBeDisabled()
  await stakeInput.fill('30')
  await page.getByRole('button', { name: 'Confirm bets' }).click()
  await expect(page.getByText('1 bet placed')).toBeVisible()
  // let the first toast go, so the next "1 bet placed" is the second slip's
  await expect(page.getByText('1 bet placed')).toBeHidden()
  await closeSlip()

  // second slip from the wallet, on another ending
  await addEnding(3, 4)
  await page.getByLabel('Stake for LAL @ GSW 3-4', { exact: true }).filter({ visible: true }).fill('60')
  await payFrom(page, 'Wallet')
  await page.getByRole('button', { name: 'Confirm bets' }).click()
  await expect(page.getByText('1 bet placed')).toBeVisible()

  await page.goto('/wallet')
  await expect(page.getByTestId('wallet-balance')).toHaveText('₱140')
  await expect(page.getByTestId('points-balance')).toHaveText('10 pts')
  // the header's accessible name starts with the visible totals, then the split
  await expect(
    page.getByRole('link', { name: '₱140 · 10 pts (wallet ₱140, points 10 pts)', exact: true }),
  ).toBeVisible()
  // the bets appear as one row per account, tagged Points and Wallet
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
