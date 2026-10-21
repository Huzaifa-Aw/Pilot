import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MetadataTemplateSettings } from "@/components/forms/metadata-template-settings";
import { BackLink } from "@/components/layout/BackLink";
import { METADATA_ENTITY_TYPES } from "@/lib/constants";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { metadataFieldSchema } from "@/lib/validations/metadata";

export const metadata: Metadata = { title: "Custom fields" };

function isMetadataEntityType(value: string): value is typeof METADATA_ENTITY_TYPES[number] {
  return METADATA_ENTITY_TYPES.some((entityType) => entityType === value);
}

export default async function MetadataTemplatesPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "ADMIN")) redirect("/overview");
  const rawTemplates = await db.metadataTemplate.findMany({
    where: { organizationId: context.organizationId },
    orderBy: [{ entityType: "asc" }, { isDefault: "desc" }],
  });
  const templates = rawTemplates.map((template) => {
    if (!isMetadataEntityType(template.entityType)) {
      throw new Error(`Unsupported metadata entity type: ${template.entityType}`);
    }
    return {
      id: template.id,
      name: template.name,
      entityType: template.entityType,
      fields: metadataFieldSchema.array().parse(template.fields),
      isDefault: template.isDefault,
    };
  });

  return (
    <div className="space-y-6">
      <BackLink href="/settings" label="Settings" currentPage="Custom fields" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization settings</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Custom fields</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          Define extra information for your organization without adding discipline-specific columns to the shared platform.
        </p>
      </header>
      <MetadataTemplateSettings templates={templates} />
    </div>
  );
}
