-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "TimesheetPeriodStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'REOPENED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "acquiredOn" DATE,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "nextServiceDate" DATE,
ADD COLUMN     "serialNumber" TEXT;

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "deploymentType" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "startDate" DATE;

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "dailyCapacityHrs" DOUBLE PRECISION NOT NULL DEFAULT 8,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "reportsToMemberId" TEXT,
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "taskCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "blockedByTaskId" TEXT,
ADD COLUMN     "parentTaskId" TEXT,
ADD COLUMN     "reporterMemberId" TEXT,
ADD COLUMN     "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "taskNumber" INTEGER;

-- CreateTable
CREATE TABLE "ProjectMember" (
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","memberId")
);

-- CreateTable
CREATE TABLE "MemberSkill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "yearsExperience" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worklog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "date" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "legacyEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worklog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "monthStart" DATE NOT NULL,
    "status" "TimesheetPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "submittedAt" TIMESTAMP(3),
    "approvedByMemberId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentMember" (
    "organizationId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentMember_pkey" PRIMARY KEY ("deploymentId","memberId")
);

-- CreateTable
CREATE TABLE "AssetCheckout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT,
    "deploymentId" TEXT,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "returnedByMemberId" TEXT,
    "notes" TEXT,

    CONSTRAINT "AssetCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMember_organizationId_memberId_idx" ON "ProjectMember"("organizationId", "memberId");

-- CreateIndex
CREATE INDEX "MemberSkill_organizationId_name_level_idx" ON "MemberSkill"("organizationId", "name", "level");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSkill_memberId_name_key" ON "MemberSkill"("memberId", "name");

-- CreateIndex
CREATE INDEX "Worklog_organizationId_memberId_date_idx" ON "Worklog"("organizationId", "memberId", "date");

-- CreateIndex
CREATE INDEX "Worklog_organizationId_projectId_date_idx" ON "Worklog"("organizationId", "projectId", "date");

-- CreateIndex
CREATE INDEX "Worklog_organizationId_taskId_date_idx" ON "Worklog"("organizationId", "taskId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Worklog_legacyEntryId_date_key" ON "Worklog"("legacyEntryId", "date");

-- CreateIndex
CREATE INDEX "TimesheetPeriod_organizationId_monthStart_status_idx" ON "TimesheetPeriod"("organizationId", "monthStart", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetPeriod_organizationId_memberId_monthStart_key" ON "TimesheetPeriod"("organizationId", "memberId", "monthStart");

-- CreateIndex
CREATE INDEX "Notification_organizationId_memberId_readAt_createdAt_idx" ON "Notification"("organizationId", "memberId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "DeploymentMember_organizationId_memberId_idx" ON "DeploymentMember"("organizationId", "memberId");

-- CreateIndex
CREATE INDEX "AssetCheckout_organizationId_assetId_returnedAt_idx" ON "AssetCheckout"("organizationId", "assetId", "returnedAt");

-- CreateIndex
CREATE INDEX "AssetCheckout_organizationId_memberId_returnedAt_idx" ON "AssetCheckout"("organizationId", "memberId", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_id_organizationId_key" ON "Deployment"("id", "organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_reportsToMemberId_idx" ON "OrganizationMember"("organizationId", "reportsToMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_taskNumber_key" ON "Task"("projectId", "taskNumber");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_reportsToMemberId_organizationId_fkey" FOREIGN KEY ("reportsToMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_organizationId_fkey" FOREIGN KEY ("parentTaskId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_blockedByTaskId_organizationId_fkey" FOREIGN KEY ("blockedByTaskId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSkill" ADD CONSTRAINT "MemberSkill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSkill" ADD CONSTRAINT "MemberSkill_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "Task"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_approvedByMemberId_organizationId_fkey" FOREIGN KEY ("approvedByMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentMember" ADD CONSTRAINT "DeploymentMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentMember" ADD CONSTRAINT "DeploymentMember_deploymentId_organizationId_fkey" FOREIGN KEY ("deploymentId", "organizationId") REFERENCES "Deployment"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentMember" ADD CONSTRAINT "DeploymentMember_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheckout" ADD CONSTRAINT "AssetCheckout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheckout" ADD CONSTRAINT "AssetCheckout_assetId_organizationId_fkey" FOREIGN KEY ("assetId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheckout" ADD CONSTRAINT "AssetCheckout_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheckout" ADD CONSTRAINT "AssetCheckout_returnedByMemberId_organizationId_fkey" FOREIGN KEY ("returnedByMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheckout" ADD CONSTRAINT "AssetCheckout_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill project scope for members already assigned work or recorded time.
INSERT INTO "ProjectMember" ("organizationId", "projectId", "memberId", "role")
SELECT DISTINCT source."organizationId", source."projectId", source."memberId", 'MEMBER'::"ProjectMemberRole"
FROM (
    SELECT assignment."organizationId", task."projectId", assignment."memberId"
    FROM "TaskAssignment" assignment
    JOIN "Task" task ON task."id" = assignment."taskId"
    UNION
    SELECT "organizationId", "projectId", "memberId" FROM "ResourceAllocation"
    UNION
    SELECT "organizationId", "projectId", "memberId" FROM "TimesheetEntry"
    UNION
    SELECT "organizationId", "projectId", "memberId" FROM "Deployment"
) source;

-- Preserve legacy deployment assignees in the new multi-person relation.
INSERT INTO "DeploymentMember" ("organizationId", "deploymentId", "memberId")
SELECT "organizationId", "id", "memberId" FROM "Deployment";

-- Assign stable project-local identifiers and initial board rank.
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", "id")::INTEGER AS number
    FROM "Task"
)
UPDATE "Task" task
SET "taskNumber" = ranked.number, "sortOrder" = ranked.number
FROM ranked
WHERE task."id" = ranked."id";

UPDATE "Project" project
SET "taskCounter" = COALESCE((
    SELECT MAX(task."taskNumber") FROM "Task" task WHERE task."projectId" = project."id"
), 0);

-- Convert each non-zero weekday from old weekly entries into a preserved daily worklog.
INSERT INTO "Worklog" (
    "id", "organizationId", "memberId", "projectId", "date", "hours",
    "description", "category", "legacyEntryId", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    entry."organizationId",
    entry."memberId",
    entry."projectId",
    entry."weekStartDate" + day."offset",
    day."hours",
    entry."notes",
    'Project',
    entry."id",
    entry."createdAt",
    entry."updatedAt"
FROM "TimesheetEntry" entry
CROSS JOIN LATERAL (VALUES
    (0, entry."monday"),
    (1, entry."tuesday"),
    (2, entry."wednesday"),
    (3, entry."thursday"),
    (4, entry."friday")
) AS day("offset", "hours")
WHERE day."hours" > 0;

-- Retain review state at monthly granularity without making a partially approved month
-- appear complete.
INSERT INTO "TimesheetPeriod" (
    "id", "organizationId", "memberId", "monthStart", "status",
    "submittedAt", "approvedByMemberId", "approvedAt", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    entry."organizationId",
    entry."memberId",
    date_trunc('month', entry."weekStartDate")::DATE,
    CASE
      WHEN BOOL_AND(entry."status" = 'APPROVED') THEN 'APPROVED'::"TimesheetPeriodStatus"
      WHEN BOOL_AND(entry."status" IN ('SUBMITTED', 'APPROVED')) THEN 'SUBMITTED'::"TimesheetPeriodStatus"
      ELSE 'OPEN'::"TimesheetPeriodStatus"
    END,
    CASE
      WHEN BOOL_AND(entry."status" IN ('SUBMITTED', 'APPROVED')) THEN MAX(entry."updatedAt")
      ELSE NULL
    END,
    CASE
      WHEN BOOL_AND(entry."status" = 'APPROVED') AND COUNT(DISTINCT entry."approvedByMemberId") = 1
      THEN MIN(entry."approvedByMemberId")
      ELSE NULL
    END,
    CASE
      WHEN BOOL_AND(entry."status" = 'APPROVED') THEN MAX(entry."approvedAt")
      ELSE NULL
    END,
    MIN(entry."createdAt"),
    MAX(entry."updatedAt")
FROM "TimesheetEntry" entry
GROUP BY entry."organizationId", entry."memberId", date_trunc('month', entry."weekStartDate")::DATE;
