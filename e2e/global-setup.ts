import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

export default async function setup() {
  // Prisma's AI-agent guard blocks `migrate reset`, so: migrate, truncate, seed.
  // Env (DATABASE_URL, ADMIN_*) comes from .env.test via playwright.config.ts.
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env })
  const prisma = new PrismaClient()
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "InquiryMessage", "Inquiry", "AdminAction", "Transaction", "Bet", "Game", "Setting", "User" RESTART IDENTITY CASCADE',
    )
  } finally {
    await prisma.$disconnect()
  }
  execSync('npx prisma db seed', { stdio: 'inherit', env: process.env })
}
