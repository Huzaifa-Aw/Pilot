-- AlterTable
ALTER TABLE "MetadataTemplate" ADD COLUMN     "defaultKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MetadataTemplate_defaultKey_key" ON "MetadataTemplate"("defaultKey");

