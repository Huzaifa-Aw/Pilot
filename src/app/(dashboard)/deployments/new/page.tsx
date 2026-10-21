import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeploymentForm } from "@/components/forms/deployment-form";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { reportTree } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Schedule deployment" };

export default async function NewDeploymentPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "MANAGER")) redirect("/deployments");
  const scopeMemberIds = roleAtLeast(context.role, "ADMIN")
    ? (await db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true }, select: { id: true } })).map(({ id }) => id)
    : await reportTree(context);

  const [members, projects] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true, id: { in: scopeMemberIds } },
      select: { id: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.project.findMany({
      where: {
        organizationId: context.organizationId,
        status: { not: "ARCHIVED" },
        ...(roleAtLeast(context.role, "ADMIN") ? {} : { members: { some: { memberId: { in: scopeMemberIds } } } }),
      },
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/deployments" label="Deployments" currentPage="New deployment" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Field coordination</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Schedule deployment</h1>
        <p className="mt-2 text-sm text-text-secondary">Choose one or more members, a project, location, and date range.</p>
      </header>
      {members.length && projects.length ? (
        <section className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
          <DeploymentForm
            members={members.map((member) => ({ id: member.id, name: member.user.name ?? member.user.email }))}
            projects={projects}
          />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-surface p-6 text-center">
          <h2 className="text-sm font-semibold text-text-primary">Add members and projects first</h2>
          <p className="mt-2 text-sm text-text-muted">Deployments need an active organization member and project.</p>
        </div>
      )}
    </div>
  );
}
