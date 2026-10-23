import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPinned, Plus } from "lucide-react";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";
import { roleAtLeast } from "@/lib/rbac";
import { reportTree } from "@/lib/permissions";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { metadataCsvHeaders } from "@/lib/metadata-csv";
import { serializeCsvRow } from "@/lib/csv";

export const metadata: Metadata = { title: "Deployments" };

export default async function DeploymentsPage() {
  const context = await resolveTenantContext();
  if (!context) return null;
  const scopedMemberIds = roleAtLeast(context.role, "ADMIN") ? undefined : roleAtLeast(context.role, "MANAGER") ? await reportTree(context) : [context.memberId];
  const [deployments, metadataFields] = await Promise.all([db.deployment.findMany({
    where: {
      organizationId: context.organizationId,
      ...(scopedMemberIds ? { OR: [
        { memberId: { in: scopedMemberIds } },
        { members: { some: { organizationId: context.organizationId, memberId: { in: scopedMemberIds } } } },
        { project: { members: { some: { memberId: { in: scopedMemberIds } } } } },
      ] } : {}),
    },
    include: {
      member: { include: { user: { select: { name: true, email: true } } } },
      members: {
        where: { organizationId: context.organizationId },
        include: { member: { include: { user: { select: { name: true, email: true } } } } },
      },
      project: { select: { id: true, code: true, title: true } },
    },
    orderBy: { startDate: "asc" },
    take: 200,
  }), getDefaultMetadataFields(context.organizationId, "deployment")]);
  const customHeaders = [...metadataCsvHeaders(metadataFields).keys()];
  const deploymentTemplate = [
    serializeCsvRow(["deploymentId", "memberEmails", "projectCode", "location", "title", "deploymentType", "country", "startDate", "endDate", "status", "notes", ...customHeaders]),
    serializeCsvRow(["", "member@example.test", "PRJ-101", "Site A", "Field review", "On-site", "Example region", "2026-11-02", "2026-11-06", "UPCOMING", "", ...customHeaders.map(() => "")]),
  ].join("\n");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Field coordination</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Deployments</h1>
          <p className="mt-2 text-sm text-text-secondary">Plan member assignments and see overlapping project work.</p>
        </div>
        {roleAtLeast(context.role, "MANAGER") && (
          <div className="flex items-center gap-2">
            <CsvImportPanel
              title="Import deployments from CSV"
              endpoint="/api/deployments/import"
              template={deploymentTemplate}
              help="Leave deploymentId blank to create. Provide an existing ID to update; separate member emails with |. Date ranges and capacity conflicts are rechecked."
            />
            <Link href="/deployments/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-600">
              <Plus size={16} aria-hidden="true" /> Schedule deployment
            </Link>
          </div>
        )}
      </header>

      {deployments.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {deployments.map((deployment) => {
            const conflicts = Array.isArray(deployment.conflictFlags) ? deployment.conflictFlags.length : 0;
            const assignedMembers = deployment.members.length
              ? deployment.members.map(({ member }) => member)
              : [deployment.member];
            return (
              <li key={deployment.id}>
                <Link href={`/deployments/${deployment.id}`} className="block min-h-36 rounded-lg border border-border-default bg-surface p-4 transition-colors duration-150 hover:bg-neutral-50 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-text-primary">{deployment.location}</h2>
                      <p className="mt-1 truncate text-xs text-text-muted">
                        {assignedMembers.map(({ user }) => user.name ?? user.email).join(", ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <OnDeploymentBadge
                          status={deployment.status}
                          startDate={deployment.startDate}
                          endDate={deployment.endDate}
                          location={deployment.location}
                        />
                      </div>
                    </div>
                    <StatusBadge status={deployment.status} />
                  </div>
                  <p className="mt-4 text-sm text-text-secondary">{formatDate(deployment.startDate)} – {formatDate(deployment.endDate)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-text-muted">{deployment.project.code} · {deployment.project.title}</span>
                    {conflicts > 0 && <StatusBadge status="OVERALLOCATED" />}
                    <ArrowRight size={15} className="shrink-0 text-brand-primary" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-info-light text-brand-primary"><MapPinned size={21} aria-hidden="true" /></div>
          <h2 className="mt-4 text-sm font-semibold text-text-primary">No deployments scheduled</h2>
          <p className="mt-2 text-sm text-text-muted">Schedule a deployment when a member needs to work at a location.</p>
          {roleAtLeast(context.role, "MANAGER") && <Link href="/deployments/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white"><Plus size={15} aria-hidden="true" /> Schedule deployment</Link>}
        </div>
      )}
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
