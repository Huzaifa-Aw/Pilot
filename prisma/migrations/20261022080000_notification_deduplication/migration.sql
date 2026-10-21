-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_memberId_type_dedupeKey_key" ON "Notification"("organizationId", "memberId", "type", "dedupeKey");
