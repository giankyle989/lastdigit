-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "phoneConfirmedById" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_phoneConfirmedById_fkey" FOREIGN KEY ("phoneConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

