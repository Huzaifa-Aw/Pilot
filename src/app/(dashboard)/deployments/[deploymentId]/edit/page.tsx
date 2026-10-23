import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeploymentForm } from "@/components/forms/deployment-form";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { getDefaultMetadataFields, metadataValuesForFields } from "@/lib/metadata";

export const metadata: Metadata = { title: "Edit deployment" };

export default async function EditDeploymentPage({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "MANAGER")) redirect("/deployments");
  const { deploymentId } = await params;
  const deployment = await db.deployment.findFirst({
    where: { id: deploymentId, organizationId: context.organizationId },
    include: {
      members: { where: { organizationId: context.organizationId }, select: { memberId: true } },
    },
  });
  if (!deployment) notFound();
  if (!(await can(context, "deployment.update", { projectId: deployment.projectId }))) redirect("/deployments");

  const [members, projects, metadataFields] = await Promise.all([
    db.organizationMember.findMany({
      where: {
        organizationId: context.organizationId,
        OR: [{ isActive: true }, { id: { in: deployment.members.map(({ memberId }) => memberId) } }, { id: deployment.memberId }],
      },
      select: { id: true, isActive: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.project.findMany({
      where: {
        organizationId: context.organizationId,
        OR: [{ status: { not: "ARCHIVED" } }, { id: deployment.projectId }],
      },
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
    getDefaultMetadataFields(context.organizationId, "deployment"),
  ]);
  const memberIds = deployment.members.length
    ? deployment.members.map(({ memberId }) => memberId)
    : [deployment.memberId];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/deployments/${deployment.id}`} label="Deployment details" currentPage="Edit deployment" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Field coordination</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Edit deployment</h1>
        <p className="mt-2 text-sm text-text-secondary">Update the assigned members, project, schedule, checklist, and metadata.</p>
      </header>
      <section className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
        <DeploymentForm
          deploymentId={deployment.id}
          members={members.map((member) => ({
            id: member.id,
            name: `${member.user.name ?? member.user.email}${member.isActive ? "" : " (inactive)"}`,
          }))}
          projects={projects}
          initialValues={{
            memberIds,
            projectId: deployment.projectId,
            title: deployment.title ?? "",
            deploymentType: deployment.deploymentType ?? "",
            location: deployment.location,
            country: deployment.country ?? "",
            startDate: deployment.startDate.toISOString().slice(0, 10),
            endDate: deployment.endDate.toISOString().slice(0, 10),
            status: deployment.status,
            notes: deployment.notes ?? "",
          }}
          initialChecklist={deployment.checklist ?? []}
          initialMetadata={metadataValuesForFields(metadataFields, deployment.metadata ?? {})}
          metadataFields={metadataFields}
        />
      </section>
    </div>
  );
}
