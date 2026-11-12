-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'SIGNUP_BONUS';
ALTER TYPE "TransactionType" ADD VALUE 'DAILY_BONUS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDailyBonusOn" TEXT,
ADD COLUMN     "referralBonusPaidAt" TIMESTAMP(3);

-- Referrers of existing players were paid at signup under the old rule.
UPDATE "User" SET "referralBonusPaidAt" = "createdAt" WHERE "referredById" IS NOT NULL;
