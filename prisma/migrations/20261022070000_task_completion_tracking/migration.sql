-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

UPDATE "Task"
SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;
