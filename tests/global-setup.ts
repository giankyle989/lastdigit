import { execSync } from 'node:child_process'

// Applies pending migrations to the test database (lastdigit_test via .env.test).
// Uses `migrate deploy` rather than `migrate reset --force`: reset is destructive and
// Prisma's agent guard refuses it. resetDb() truncates all tables before each test.
export default function setup() {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env })
}
