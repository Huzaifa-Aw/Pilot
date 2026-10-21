-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "pendingKey" TEXT;

-- CreateTable
CREATE TABLE "AllocationWeekLock" (
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AllocationWeekLock_pkey" PRIMARY KEY ("organizationId","memberId","weekStartDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_pendingKey_key" ON "Invitation"("pendingKey");

-- AddForeignKey
ALTER TABLE "AllocationWeekLock" ADD CONSTRAINT "AllocationWeekLock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationWeekLock" ADD CONSTRAINT "AllocationWeekLock_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

