import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectForm } from "@/components/forms/project-form";
import { ProjectArchiveButton } from "@/components/forms/project-archive-button";
import { ProjectMembersForm } from "@/components/forms/project-members-form";
import { BackLink } from "@/components/layout/BackLink";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getDefaultMetadataFields, metadataValuesForFields } from "@/lib/metadata";
import { resolveTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const { projectId } = await params;

  const projectAccess = await can(context, "project.update", { projectId });
  if (!projectAccess) redirect("/projects");
  const [project, metadataFields, activeMembers, projectMembers] = await Promise.all([
    db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      budgetHours: true,
      tags: true,
      metadata: true,
    },
    }),
    getDefaultMetadataFields(context.organizationId, "project"),
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, title: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.projectMember.findMany({
      where: { organizationId: context.organizationId, projectId },
      select: { memberId: true, role: true, member: { select: { user: { select: { name: true, email: true } } } } },
      orderBy: { role: "asc" },
    }),
  ]);
  if (!project) notFound();
  const initialMetadata = metadataValuesForFields(metadataFields, project.metadata ?? {});
  const canManageMembers = await can(context, "project.members.manage", { projectId });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/projects/${project.id}`} label={project.title} currentPage="Project settings" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Project settings</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Edit project</h1>
        <p className="mt-2 text-sm text-text-secondary">Update project details. Changes are recorded in the audit history.</p>
      </header>
      <Card className="p-4 sm:p-6">
        <ProjectForm project={project} metadataFields={metadataFields} initialMetadata={initialMetadata} />
      </Card>
      {canManageMembers && (
        <Card className="space-y-4 p-4 sm:p-6">
          <div><h2 className="font-heading text-lg font-semibold text-text-primary">Project access</h2><p className="mt-1 text-sm text-text-muted">Assign project members and leads.</p></div>
          <ProjectMembersForm
            projectId={project.id}
            members={activeMembers.map((member) => ({ id: member.id, name: member.user.name ?? member.user.email, title: member.title }))}
            initial={projectMembers.map((membership) => ({ id: membership.memberId, role: membership.role }))}
          />
        </Card>
      )}
      {context.role === "OWNER" || context.role === "ADMIN" ? (
        <Card className="flex flex-col gap-3 border-error-light p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Archive project</h2>
            <p className="mt-1 text-sm text-text-muted">Remove it from active lists without deleting its history.</p>
          </div>
          <ProjectArchiveButton projectId={project.id} />
        </Card>
      ) : null}
    </div>
  );
}
