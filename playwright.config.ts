import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100/login',
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      AUTH_SECRET: process.env.AUTH_SECRET!,
      AUTH_TRUST_HOST: 'true',
      CRON_SECRET: process.env.CRON_SECRET!,
      BALLDONTLIE_API_KEY: 'unused',
    },
  },
})
