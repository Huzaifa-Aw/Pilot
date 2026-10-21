-- CreateIndex
CREATE INDEX "AssetCheckout_organizationId_deploymentId_idx" ON "AssetCheckout"("organizationId", "deploymentId");

-- AddForeignKey
ALTER TABLE "AssetCheckout" ADD CONSTRAINT "AssetCheckout_deploymentId_organizationId_fkey" FOREIGN KEY ("deploymentId", "organizationId") REFERENCES "Deployment"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
