import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { confirmPhone } from '../src/server/admin/players'
import { registerPlayer } from '../src/server/users'
import { login, logout } from './helpers'

test('superadmin adds a manager; the manager grants points but cannot manage games or settings', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name
  const manager = `mgr_${tag}`
  const player = `pat_${tag}`
  const externalId = tag === 'desktop' ? 7101 : 7102
  const mobile = testInfo.project.use.isMobile === true

  const admin = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'admin' } })
  const pat = await registerPlayer({
    username: player,
    password: 'secret123',
    phone: tag === 'desktop' ? '0917 000 0201' : '0917 000 0202',
  })
  await confirmPhone(admin.id, pat.id)
  const game = await prisma.game.create({
    data: {
      externalId,
      startsAt: new Date(Date.now() + 3600_000),
      awayTeam: 'BOS',
      homeTeam: 'NYK',
      status: 'SCHEDULED',
    },
  })

  // superadmin adds the manager
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto('/admin/staff')
  await page.getByRole('button', { name: 'Add manager' }).click()
  await page.getByLabel('Username').fill(manager)
  await page.getByLabel('Temporary password').fill('managerpw1')
  await page.getByRole('dialog').getByRole('button', { name: 'Add manager' }).click()
  await expect(page.getByText('Manager added')).toBeVisible()
  await expect(page.getByText(manager, { exact: true })).toBeVisible()
  await logout(page, 'admin')

  // the manager signs in: no Settings or Staff, no Force sync, no Void
  await login(page, manager, 'managerpw1')
  await page.waitForURL('**/admin')
  if (mobile) await page.getByRole('button', { name: 'Open menu' }).click()
  const nav = page.getByRole('navigation', { name: 'Admin' }).filter({ visible: true })
  await expect(nav.getByRole('link', { name: 'Players' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0)
  if (mobile) await page.keyboard.press('Escape')

  await page.goto('/admin/settings')
  await page.waitForURL(/\/admin$/)
  await page.goto('/admin/staff')
  await page.waitForURL(/\/admin$/)

  await page.goto(`/admin/games?game=${game.id}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Void game' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Force sync' })).toHaveCount(0)

  // ...but grants points to a player
  await page.goto(`/admin/players?player=${pat.id}`)
  await page.getByRole('button', { name: 'Grant', exact: true }).click()
  await page.getByLabel('Amount').fill('250')
  await page.getByLabel('Note').fill('cash in')
  await page.getByRole('button', { name: 'Grant points', exact: true }).click()
  await expect(page.getByText(/^Points updated/)).toBeVisible()
  expect((await prisma.user.findUniqueOrThrow({ where: { id: pat.id } })).balance).toBeGreaterThanOrEqual(250)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})
