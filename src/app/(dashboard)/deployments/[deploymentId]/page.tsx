import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Pencil } from "lucide-react";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { deploymentConflictSchema } from "@/lib/validations/deployment";
import { getDefaultMetadataFields, metadataValuesForFields, unconfiguredMetadataValues } from "@/lib/metadata";
import { MetadataValuesDisplay } from "@/components/forms/metadata-fields-editor";

export const metadata: Metadata = { title: "Deployment details" };

export default async function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const { deploymentId } = await params;
  const deployment = await db.deployment.findFirst({
    where: { id: deploymentId, organizationId: context.organizationId },
    include: {
      member: { include: { user: { select: { name: true, email: true } } } },
      members: {
        where: { organizationId: context.organizationId },
        include: { member: { include: { user: { select: { name: true, email: true } } } } },
      },
      project: { select: { id: true, code: true, title: true } },
    },
  });
  if (!deployment) notFound();
  if (!(await can(context, "deployment.read", { projectId: deployment.projectId }))) notFound();
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "deployment");

  const parsedConflicts = deploymentConflictSchema.safeParse(deployment.conflictFlags ?? []);
  if (!parsedConflicts.success) throw new Error("The deployment conflict data is invalid.");
  const conflicts = parsedConflicts.data;
  const assignedMembers = deployment.members.length
    ? deployment.members.map(({ member }) => member)
    : [deployment.member];
  const memberNames = new Map(assignedMembers.map((member) => [
    member.id,
    member.user.name ?? member.user.email,
  ]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/deployments" label="Deployments" currentPage="Deployment details" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MapPin size={17} className="text-brand-primary" aria-hidden="true" />
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-text-primary">{deployment.location}</h1>
            <StatusBadge status={deployment.status} />
            <OnDeploymentBadge
              status={deployment.status}
              startDate={deployment.startDate}
              endDate={deployment.endDate}
              location={deployment.location}
            />
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            {assignedMembers.map((member) => member.user.name ?? member.user.email).join(", ")} · {deployment.project.code} · {deployment.project.title}
          </p>
          <p className="mt-1 text-sm text-text-muted">{formatDate(deployment.startDate)} – {formatDate(deployment.endDate)}</p>
          {(deployment.title || deployment.deploymentType || deployment.country) && (
            <p className="mt-3 text-sm text-text-muted">
              {[deployment.title, deployment.deploymentType, deployment.country].filter(Boolean).join(" · ")}
            </p>
          )}
          {deployment.notes && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-text-secondary">{deployment.notes}</p>}
        </div>
        {roleAtLeast(context.role, "MANAGER") && (
          <Link href={`/deployments/${deployment.id}/edit`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border-default px-4 text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-neutral-50">
            <Pencil size={15} aria-hidden="true" /> Edit deployment
          </Link>
        )}
      </header>

      <section aria-labelledby="conflict-title" className="space-y-3">
        <div>
          <h2 id="conflict-title" className="font-heading text-lg font-semibold text-text-primary">Schedule conflicts</h2>
          <p className="mt-1 text-sm text-text-muted">Project allocations overlapping this deployment&apos;s dates.</p>
        </div>
        {conflicts.length ? (
          <ul className="space-y-2">
            {conflicts.map((conflict) => (
              <li key={conflict.allocationId} className="flex flex-col gap-2 rounded-lg border border-warning-light bg-warning-light/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{conflict.projectTitle}</p>
                  <p className="mt-1 font-mono text-xs text-text-muted">
                    {conflict.memberId ? `${memberNames.get(conflict.memberId) ?? "Assigned member"} · ` : ""}
                    {conflict.projectCode} · Week {formatDateString(conflict.weekStartDate)}
                  </p>
                </div>
                <p className="text-sm text-warning-dark">{conflict.allocationPct}% · {conflict.plannedHrs} hrs · {conflict.mode}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-border-default bg-surface px-4 py-6 text-sm text-text-muted">No overlapping project allocations were found when this deployment was scheduled.</p>
        )}
      </section>

      {Array.isArray(deployment.checklist) && deployment.checklist.length > 0 && (
        <section aria-labelledby="checklist-title">
          <h2 id="checklist-title" className="font-heading text-lg font-semibold text-text-primary">Checklist</h2>
          <ul className="mt-3 divide-y divide-border-default rounded-lg border border-border-default bg-surface px-4">
            {deployment.checklist.map((item, index) => {
              if (!item || typeof item !== "object" || !("label" in item) || typeof item.label !== "string") return null;
              return <li key={index} className="flex min-h-12 items-center gap-3 py-2 text-sm text-text-secondary"><span aria-label={"complete" in item && item.complete === true ? "Complete" : "Not complete"} className={`size-4 rounded border ${"complete" in item && item.complete === true ? "border-brand-primary bg-brand-primary" : "border-border-default"}`} />{item.label}</li>;
            })}
          </ul>
        </section>
      )}
      <section aria-labelledby="metadata-title" className="space-y-3">
        <h2 id="metadata-title" className="font-heading text-lg font-semibold text-text-primary">Additional details</h2>
        <MetadataValuesDisplay
          fields={metadataFields}
          values={metadataValuesForFields(metadataFields, deployment.metadata ?? {})}
          unconfigured={unconfiguredMetadataValues(metadataFields, deployment.metadata ?? {})}
        />
      </section>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatDateString(date: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}
