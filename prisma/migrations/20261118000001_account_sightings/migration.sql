-- CreateEnum
CREATE TYPE "SightingKind" AS ENUM ('DEVICE', 'NETWORK');

-- CreateTable
CREATE TABLE "AccountSighting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SightingKind" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSighting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountSighting_kind_fingerprint_idx" ON "AccountSighting"("kind", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSighting_userId_kind_fingerprint_key" ON "AccountSighting"("userId", "kind", "fingerprint");

-- AddForeignKey
ALTER TABLE "AccountSighting" ADD CONSTRAINT "AccountSighting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

