import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TaskWorkflowSettings } from "@/components/forms/task-workflow-settings";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Workflows and labels" };

export default async function TaskWorkflowsPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "ADMIN")) redirect("/overview");
  const [workflows, labels, metadataFields] = await Promise.all([
    db.taskWorkflow.findMany({
      where: { organizationId: context.organizationId },
      include: {
        statuses: { orderBy: { sortOrder: "asc" } },
        transitions: { select: { fromStatusId: true, toStatusId: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    db.taskLabel.findMany({
      where: { organizationId: context.organizationId },
      orderBy: { name: "asc" },
    }),
    getDefaultMetadataFields(context.organizationId, "task"),
  ]);

  return (
    <div className="space-y-6">
      <BackLink href="/settings" label="Settings" currentPage="Workflows and labels" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Task configuration</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Workflows and labels</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">Set the statuses, allowed moves, required task details, and reusable labels used by your projects.</p>
      </header>
      <TaskWorkflowSettings initialWorkflows={workflows} initialLabels={labels} metadataFields={metadataFields} />
    </div>
  );
}
