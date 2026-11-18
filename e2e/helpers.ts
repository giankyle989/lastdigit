import type { Page } from '@playwright/test'

export async function signup(page: Page, username: string, phone: string, ref?: string) {
  await page.goto(ref ? `/signup?ref=${ref}` : '/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL('**/games')
}

export async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** Players log out from More; admins from the console header (on a page with no drawer open). */
export async function logout(page: Page, from: 'player' | 'admin') {
  await page.goto(from === 'player' ? '/more' : '/admin')
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL('**/login')
}
