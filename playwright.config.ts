import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name} (.env.test)`)
  return v
}

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 90_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // iPhone 13 viewport, touch and user agent on Chromium (only Chromium is installed).
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100/login',
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: requireEnv('DATABASE_URL'),
      AUTH_SECRET: requireEnv('AUTH_SECRET'),
      AUTH_TRUST_HOST: 'true',
      CRON_SECRET: requireEnv('CRON_SECRET'),
      BALLDONTLIE_API_KEY: 'unused',
      // never call balldontlie from E2E; the test seeds its own games
      SYNC_INTERVAL_MINUTES: '0',
      // every E2E signup comes from localhost
      SIGNUP_LIMIT_PER_HOUR: '100',
    },
  },
})
