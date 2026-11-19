import { expect, test } from '@playwright/test'

import { prisma } from '../src/lib/db'
import { signup } from './helpers'

test('a cash in ticket starts from an editable template', async ({ page }, testInfo) => {
  const tag = testInfo.project.name
  const dana = `dana_${tag}`
  const phone = tag === 'desktop' ? '0917 000 0501' : '0917 000 0502'

  await signup(page, dana, phone)
  await page.goto('/more/support')

  const message = page.getByLabel('Message')
  await page.getByRole('radio', { name: 'Cash out' }).check()
  await expect(message).toHaveValue(`I'd like to cash out from my wallet.\nAmount: \nSend to: ${phone}`)
  await expect(page.getByText('Wallet: 0 pts available')).toBeVisible()

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
})
