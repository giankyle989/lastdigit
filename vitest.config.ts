import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
