-- DropForeignKey
ALTER TABLE "TimesheetEntry" DROP CONSTRAINT "TimesheetEntry_approvedByMemberId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAllocation_organizationId_memberId_projectId_weekSt_key" ON "ResourceAllocation"("organizationId", "memberId", "projectId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_approvedByMemberId_organizationId_fkey" FOREIGN KEY ("approvedByMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

