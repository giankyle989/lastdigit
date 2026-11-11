import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/server/passwords'
import { generateReferralCode } from '../src/server/referral-code'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!username || !password) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set')
  const existing = await prisma.user.findUnique({ where: { usernameKey: username.toLowerCase() } })
  if (existing && existing.role === 'PLAYER') {
    throw new Error(`refusing to promote existing player "${existing.username}" to admin; choose a different ADMIN_USERNAME`)
  }
  const passwordHash = await hashPassword(password)
  await prisma.user.upsert({
    where: { usernameKey: username.toLowerCase() },
    update: { passwordHash, role: 'ADMIN' },
    create: { username, usernameKey: username.toLowerCase(), passwordHash, role: 'ADMIN', referralCode: generateReferralCode() },
  })
  await prisma.setting.upsert({ where: { key: 'referralBonus' }, update: {}, create: { key: 'referralBonus', value: '500' } })
  console.log(`Seeded admin "${username}"`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
