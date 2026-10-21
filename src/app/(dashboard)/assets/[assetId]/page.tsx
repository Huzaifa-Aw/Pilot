import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { AssetForm } from "@/components/forms/asset-form";
import { AssetCheckoutForm } from "@/components/forms/asset-checkout-form";
import { AssetProjectLinkForm } from "@/components/forms/asset-project-link-form";
import { MetadataValuesDisplay } from "@/components/forms/metadata-fields-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { getDefaultMetadataFields, metadataValuesForFields, unconfiguredMetadataValues } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Asset details" };

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const { assetId } = await params;
  const [asset, metadataFields, projects, members, linkedProjects, deployments] = await Promise.all([
    db.asset.findFirst({
      where: { id: assetId, organizationId: context.organizationId },
      include: {
        projects: {
          where: { organizationId: context.organizationId },
          include: { project: { select: { id: true, code: true, title: true } } },
        },
        checkouts: {
          where: { organizationId: context.organizationId, returnedAt: null },
          take: 1,
          orderBy: { checkedOutAt: "desc" },
          include: {
            member: { include: { user: { select: { name: true, email: true } } } },
            project: { select: { id: true, code: true, title: true } },
            deployment: { select: { id: true, title: true, location: true } },
          },
        },
      },
    }),
    getDefaultMetadataFields(context.organizationId, "asset"),
    db.project.findMany({
      where: { organizationId: context.organizationId, status: { not: "ARCHIVED" } },
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.projectAsset.findMany({
      where: { assetId, organizationId: context.organizationId },
      select: { projectId: true },
    }),
    db.deployment.findMany({
      where: { organizationId: context.organizationId, status: { in: ["UPCOMING", "ACTIVE"] }, endDate: { gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") } },
      select: { id: true, title: true, location: true, projectId: true },
      orderBy: { startDate: "asc" },
    }),
  ]);
  if (!asset) notFound();
  const hasCustomMetadata =
    asset.metadata !== null &&
    typeof asset.metadata === "object" &&
    !Array.isArray(asset.metadata) &&
    Object.keys(asset.metadata).length > 0;
  const linkedIds = new Set(linkedProjects.map((link) => link.projectId));
  const availableProjects = projects.filter((project) => !linkedIds.has(project.id));
  const activeCheckout = asset.checkouts[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/assets" label="Assets" currentPage="Asset details" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-info-light text-brand-primary"><Package size={22} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-text-muted">{asset.assetCode}</p>
              <StatusBadge status={activeCheckout ? "IN_USE" : asset.status === "ACTIVE" ? "AVAILABLE" : asset.status} />
            </div>
            <h1 className="mt-1 break-words font-heading text-2xl font-semibold tracking-tight text-text-primary">{asset.title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{asset.category ?? "Uncategorized"}</p>
          </div>
        </div>
      </header>
      {asset.description && <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{asset.description}</p>}

      <dl className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 text-sm sm:grid-cols-2 sm:p-5">
        <div><dt className="text-text-muted">Location</dt><dd className="mt-1 font-medium text-text-primary">{asset.location ?? "Not set"}</dd></div>
        <div><dt className="text-text-muted">Serial number</dt><dd className="mt-1 font-medium text-text-primary">{asset.serialNumber ?? "Not set"}</dd></div>
        <div><dt className="text-text-muted">Acquired</dt><dd className="mt-1 font-medium text-text-primary">{asset.acquiredOn?.toLocaleDateString() ?? "Not set"}</dd></div>
        <div><dt className="text-text-muted">Next service</dt><dd className="mt-1 font-medium text-text-primary">{asset.nextServiceDate?.toLocaleDateString() ?? "Not set"}</dd></div>
      </dl>

      <section aria-labelledby="asset-metadata-title" className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
        <h2 id="asset-metadata-title" className="font-heading text-base font-semibold text-text-primary">Asset details</h2>
        <MetadataValuesDisplay fields={metadataFields} values={metadataValuesForFields(metadataFields, asset.metadata ?? {})} unconfigured={unconfiguredMetadataValues(metadataFields, asset.metadata ?? {})} />
        {!hasCustomMetadata && metadataFields.length === 0 && (
          <p className="mt-2 text-sm text-text-muted">No custom fields are configured for assets.</p>
        )}
      </section>

      <AssetCheckoutForm
        assetId={asset.id}
        activeCheckout={activeCheckout}
        members={members.map((member) => ({ id: member.id, name: member.user.name ?? member.user.email }))}
        projects={projects}
        deployments={deployments}
        canManage={roleAtLeast(context.role, "MANAGER")}
        canCheckout={asset.status === "ACTIVE"}
      />

      <section aria-labelledby="linked-projects-title" className="space-y-3">
        <div>
          <h2 id="linked-projects-title" className="font-heading text-lg font-semibold text-text-primary">Linked projects</h2>
          <p className="mt-1 text-sm text-text-muted">Projects that use or reference this asset.</p>
        </div>
        {asset.projects.length ? (
          <ul className="divide-y divide-border-default rounded-lg border border-border-default bg-surface">
            {asset.projects.map(({ project }) => (
              <li key={project.id} className="px-4 py-3">
                <Link href={`/projects/${project.id}`} className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-brand-primary hover:underline">
                  <span className="min-w-0 truncate">{project.code} · {project.title}</span><span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-surface px-4 py-6 text-sm text-text-muted">This asset is not linked to a project yet.</p>
        )}
        {roleAtLeast(context.role, "MANAGER") && (
          <AssetProjectLinkForm assetId={asset.id} projects={availableProjects} />
        )}
      </section>

      {roleAtLeast(context.role, "MANAGER") && (
        <section aria-labelledby="edit-asset-title" className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
          <h2 id="edit-asset-title" className="mb-4 font-heading text-lg font-semibold text-text-primary">Edit asset</h2>
          <AssetForm
            asset={asset}
            metadataFields={metadataFields}
            initialMetadata={metadataValuesForFields(metadataFields, asset.metadata ?? {})}
          />
        </section>
      )}
    </div>
  );
}
