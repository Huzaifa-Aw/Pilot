CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');
CREATE TYPE "AuditFailureCategory" AS ENUM ('USER_ERROR', 'APPLICATION_ERROR');
ALTER TYPE "AuditAction" ADD VALUE 'IMPORT';
ALTER TYPE "AuditAction" ADD VALUE 'ERROR';

ALTER TABLE "AuditLog"
ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
ADD COLUMN "failureCategory" "AuditFailureCategory",
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "summary" TEXT,
ADD COLUMN "correlationId" TEXT;

ALTER TABLE "Worklog" ADD COLUMN "importKey" TEXT;

CREATE INDEX "AuditLog_organizationId_severity_createdAt_idx"
ON "AuditLog"("organizationId", "severity", "createdAt");

CREATE INDEX "AuditLog_organizationId_outcome_createdAt_idx"
ON "AuditLog"("organizationId", "outcome", "createdAt");

CREATE INDEX "AuditLog_correlationId_idx"
ON "AuditLog"("correlationId");

CREATE UNIQUE INDEX "Worklog_organizationId_importKey_key"
ON "Worklog"("organizationId", "importKey");
