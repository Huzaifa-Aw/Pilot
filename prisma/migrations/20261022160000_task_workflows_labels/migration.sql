CREATE TABLE "TaskWorkflow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskWorkflowStatus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TaskStatus" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiredFieldKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskWorkflowStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskWorkflowTransition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "fromStatusId" TEXT NOT NULL,
    "toStatusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskWorkflowTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskLabel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'neutral',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskLabelAssignment" (
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskLabelAssignment_pkey" PRIMARY KEY ("taskId", "labelId")
);

ALTER TABLE "Project" ADD COLUMN "workflowId" TEXT;
ALTER TABLE "Task" ADD COLUMN "workflowStatusId" TEXT;
ALTER TABLE "Task" ADD COLUMN "flaggedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "flaggedByMemberId" TEXT;
ALTER TABLE "Task" ADD COLUMN "flagReason" TEXT;

CREATE UNIQUE INDEX "TaskWorkflow_id_organizationId_key" ON "TaskWorkflow"("id", "organizationId");
CREATE UNIQUE INDEX "TaskWorkflow_organizationId_name_key" ON "TaskWorkflow"("organizationId", "name");
CREATE INDEX "TaskWorkflow_organizationId_isDefault_idx" ON "TaskWorkflow"("organizationId", "isDefault");
CREATE UNIQUE INDEX "TaskWorkflowStatus_id_organizationId_key" ON "TaskWorkflowStatus"("id", "organizationId");
CREATE UNIQUE INDEX "TaskWorkflowStatus_workflowId_key_key" ON "TaskWorkflowStatus"("workflowId", "key");
CREATE INDEX "TaskWorkflowStatus_organizationId_workflowId_sortOrder_idx" ON "TaskWorkflowStatus"("organizationId", "workflowId", "sortOrder");
CREATE UNIQUE INDEX "TaskWorkflowTransition_fromStatusId_toStatusId_key" ON "TaskWorkflowTransition"("fromStatusId", "toStatusId");
CREATE INDEX "TaskWorkflowTransition_organizationId_workflowId_idx" ON "TaskWorkflowTransition"("organizationId", "workflowId");
CREATE UNIQUE INDEX "TaskLabel_id_organizationId_key" ON "TaskLabel"("id", "organizationId");
CREATE UNIQUE INDEX "TaskLabel_organizationId_name_key" ON "TaskLabel"("organizationId", "name");
CREATE INDEX "TaskLabel_organizationId_name_idx" ON "TaskLabel"("organizationId", "name");
CREATE INDEX "TaskLabelAssignment_organizationId_labelId_idx" ON "TaskLabelAssignment"("organizationId", "labelId");
CREATE INDEX "Project_organizationId_workflowId_idx" ON "Project"("organizationId", "workflowId");
CREATE INDEX "Task_organizationId_workflowStatusId_idx" ON "Task"("organizationId", "workflowStatusId");
CREATE INDEX "Task_organizationId_flaggedAt_idx" ON "Task"("organizationId", "flaggedAt");

INSERT INTO "TaskWorkflow" ("id", "organizationId", "name", "isDefault", "updatedAt")
SELECT gen_random_uuid()::TEXT, id, 'Default workflow', true, CURRENT_TIMESTAMP
FROM "Organization";

INSERT INTO "TaskWorkflowStatus" ("id", "organizationId", "workflowId", "key", "name", "category", "sortOrder", "isInitial", "updatedAt")
SELECT
    gen_random_uuid()::TEXT,
    workflow."organizationId",
    workflow."id",
    status.key,
    status.name,
    status.category::"TaskStatus",
    status.sortOrder,
    status.isInitial,
    CURRENT_TIMESTAMP
FROM "TaskWorkflow" workflow
CROSS JOIN (VALUES
    ('BACKLOG', 'Backlog', 'BACKLOG', 0, true),
    ('IN_PROGRESS', 'In progress', 'IN_PROGRESS', 1, false),
    ('UNDER_REVIEW', 'Under review', 'UNDER_REVIEW', 2, false),
    ('APPROVED', 'Approved', 'APPROVED', 3, false),
    ('COMPLETED', 'Completed', 'COMPLETED', 4, false),
    ('CANCELLED', 'Cancelled', 'CANCELLED', 5, false)
) AS status(key, name, category, sortOrder, isInitial);

INSERT INTO "TaskWorkflowTransition" ("id", "organizationId", "workflowId", "fromStatusId", "toStatusId")
SELECT
    gen_random_uuid()::TEXT,
    fromStatus."organizationId",
    fromStatus."workflowId",
    fromStatus."id",
    toStatus."id"
FROM "TaskWorkflowStatus" fromStatus
JOIN "TaskWorkflowStatus" toStatus
  ON toStatus."workflowId" = fromStatus."workflowId"
 AND toStatus."id" <> fromStatus."id";

UPDATE "Project" project
SET "workflowId" = workflow."id"
FROM "TaskWorkflow" workflow
WHERE workflow."organizationId" = project."organizationId"
  AND workflow."isDefault" = true;

UPDATE "Task" task
SET "workflowStatusId" = status."id"
FROM "TaskWorkflowStatus" status
JOIN "Project" project ON project."workflowId" = status."workflowId"
WHERE task."projectId" = project."id"
  AND task."organizationId" = project."organizationId"
  AND status."organizationId" = task."organizationId"
  AND status."category" = task."status";

ALTER TABLE "Project"
ADD CONSTRAINT "Project_workflowId_organizationId_fkey"
FOREIGN KEY ("workflowId", "organizationId") REFERENCES "TaskWorkflow"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_workflowStatusId_organizationId_fkey"
FOREIGN KEY ("workflowStatusId", "organizationId") REFERENCES "TaskWorkflowStatus"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_flaggedByMemberId_organizationId_fkey"
FOREIGN KEY ("flaggedByMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskWorkflow"
ADD CONSTRAINT "TaskWorkflow_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskWorkflowStatus"
ADD CONSTRAINT "TaskWorkflowStatus_workflowId_organizationId_fkey"
FOREIGN KEY ("workflowId", "organizationId") REFERENCES "TaskWorkflow"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskWorkflowTransition"
ADD CONSTRAINT "TaskWorkflowTransition_workflowId_organizationId_fkey"
FOREIGN KEY ("workflowId", "organizationId") REFERENCES "TaskWorkflow"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskWorkflowTransition"
ADD CONSTRAINT "TaskWorkflowTransition_fromStatusId_organizationId_fkey"
FOREIGN KEY ("fromStatusId", "organizationId") REFERENCES "TaskWorkflowStatus"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskWorkflowTransition"
ADD CONSTRAINT "TaskWorkflowTransition_toStatusId_organizationId_fkey"
FOREIGN KEY ("toStatusId", "organizationId") REFERENCES "TaskWorkflowStatus"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskLabel"
ADD CONSTRAINT "TaskLabel_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskLabelAssignment"
ADD CONSTRAINT "TaskLabelAssignment_taskId_organizationId_fkey"
FOREIGN KEY ("taskId", "organizationId") REFERENCES "Task"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskLabelAssignment"
ADD CONSTRAINT "TaskLabelAssignment_labelId_organizationId_fkey"
FOREIGN KEY ("labelId", "organizationId") REFERENCES "TaskLabel"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
