// With a config file Prisma no longer loads .env itself. dotenv never overrides variables already
// set, so the tests' DATABASE_URL (from .env.test) still wins.
import 'dotenv/config'

import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
