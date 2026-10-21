import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AssetForm } from "@/components/forms/asset-form";
import { BackLink } from "@/components/layout/BackLink";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Register asset" };

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "MANAGER")) redirect("/assets");
  const [metadataFields, params] = await Promise.all([
    getDefaultMetadataFields(context.organizationId, "asset"),
    searchParams,
  ]);
  const initialCategory = params.category?.trim().slice(0, 100) ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/assets" label="Assets" currentPage="New asset" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization resources</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Register asset</h1>
        <p className="mt-2 text-sm text-text-secondary">Add a resource to the organization registry.</p>
      </header>
      <section className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
        <AssetForm metadataFields={metadataFields} initialCategory={initialCategory} />
      </section>
    </div>
  );
}
