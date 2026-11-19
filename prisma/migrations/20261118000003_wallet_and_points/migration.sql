-- One balance becomes two: today's balance is the wallet; points start at 0.
CREATE TYPE "Account" AS ENUM ('WALLET', 'POINTS');
ALTER TABLE "User" RENAME COLUMN "balance" TO "walletBalance";
ALTER TABLE "User" ADD COLUMN "pointsBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "account" "Account" NOT NULL DEFAULT 'WALLET';
ALTER TABLE "Bet" ADD COLUMN "pointsStake" INTEGER NOT NULL DEFAULT 0;
