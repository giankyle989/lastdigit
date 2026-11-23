import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { confirmPhone } from '../src/server/admin/players'
import { login, logout, signup } from './helpers'

test('a cash in ticket starts from a template, and staff record it from the ticket', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name
  const dana = `dana_${tag}`
  const phone = tag === 'desktop' ? '0917 000 0501' : '0917 000 0502'

  await signup(page, dana, phone)
  await page.goto('/more/support')

  const message = page.getByLabel('Message')
  await page.getByRole('radio', { name: 'Cash out' }).check()
  await expect(message).toHaveValue(`I'd like to cash out from my wallet.\nAmount: \nSend to: ${phone}`)
  await expect(page.getByText('Wallet: ₱0 available')).toBeVisible()

  // An untouched template is swapped; the player's edits are kept from then on.
  await page.getByRole('radio', { name: 'Cash in' }).check()
  await expect(message).toHaveValue(`I'd like to cash in.\nAmount: \nPaid from: ${phone}\nReference no.: `)
  await message.fill(`I'd like to cash in.\nAmount: 500\nPaid from: ${phone}\nReference no.: 12345`)
  await page.getByRole('radio', { name: 'Cash out' }).check()
  await page.getByRole('radio', { name: 'Cash in' }).check()
  await expect(message).toHaveValue(/Amount: 500/)
  await page.getByRole('button', { name: 'Send' }).click()
  await page.waitForURL('**/more/support/*')

  const user = await prisma.user.findUniqueOrThrow({ where: { usernameKey: dana } })
  const ticket = await prisma.inquiry.findFirstOrThrow({
    where: { userId: user.id },
    include: { messages: true },
  })
  expect(ticket.subject).toBe('Cash in')
  expect(ticket.messages[0]?.body).toContain('Reference no.: 12345')
  await expect(page.getByText('Reference no.: 12345')).toBeVisible()
  await logout(page, 'player')

  // Staff record the cash in from the ticket: amount prefilled, then replied and closed.
  const admin = await prisma.user.findUniqueOrThrow({ where: { usernameKey: 'admin' } })
  await login(page, 'admin', 'admin12345')
  await page.waitForURL('**/admin')
  await page.goto(`/admin/support?ticket=${ticket.id}`)
  // An unconfirmed number blocks the cash in up front, with a pointer to the player drawer.
  await expect(page.getByTestId('ticket-cash-hint')).toContainText("Confirm the player's number")
  await expect(page.getByRole('button', { name: 'Record cash in' })).toBeDisabled()
  await confirmPhone(admin.id, user.id)
  await page.reload()
  await expect(page.getByTestId('ticket-cash-hint')).toHaveText('Wallet: ₱0')
  await page.getByRole('button', { name: 'Record cash in' }).click()
  await expect(page.getByLabel('Amount')).toHaveValue('500')
  await page.getByLabel('Note').fill('ref 12345')
  await page.getByRole('dialog').getByRole('button', { name: 'Record cash in' }).click()
  await expect(page.getByText(/^Cash in recorded/)).toBeVisible()
  await expect(page.getByText('Cash in of 500 recorded.')).toBeVisible()
  const after = await prisma.inquiry.findUniqueOrThrow({ where: { id: ticket.id } })
  expect(after.status).toBe('CLOSED')
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).walletBalance).toBe(500)
})
