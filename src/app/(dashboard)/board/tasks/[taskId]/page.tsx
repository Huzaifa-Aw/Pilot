import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/layout/BackLink";
import { MetadataValuesDisplay } from "@/components/forms/metadata-fields-editor";
import { TaskStatusControl } from "@/components/forms/task-form";
import { TaskEditControl } from "@/components/forms/work-item-edit-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskLabelBadge } from "@/components/data-display/task-label-badge";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { resolveTenantContext } from "@/lib/tenant";
import { getDefaultMetadataFields, metadataValuesForFields, unconfiguredMetadataValues } from "@/lib/metadata";

export const metadata: Metadata = { title: "Task details" };

export default async function BoardTaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const { taskId } = await params;
  const task = await db.task.findFirst({
    where: { id: taskId, organizationId: context.organizationId },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          title: true,
          workflow: { include: { statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } },
        },
      },
      milestone: { select: { id: true, title: true } },
      workflowStatus: { select: { id: true, name: true, category: true, sortOrder: true } },
      labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      assignments: {
        include: {
          member: { select: { id: true, discipline: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!task) notFound();
  const [canEdit, canMove, metadataFields] = await Promise.all([
    can(context, "task.update", { projectId: task.projectId }),
    can(context, "task.move", { projectId: task.projectId, taskAssigneeIds: task.assignments.map(({ memberId }) => memberId) }),
    getDefaultMetadataFields(context.organizationId, "task"),
  ]);
  const [projectTasks, members, milestones, labels] = await Promise.all([
    db.task.findMany({
      where: { organizationId: context.organizationId, projectId: task.projectId, id: { not: task.id } },
      select: { id: true, title: true, taskNumber: true },
      orderBy: { taskNumber: "asc" },
    }),
    canEdit
      ? db.organizationMember.findMany({
          where: { organizationId: context.organizationId, isActive: true },
          select: { id: true, discipline: true, user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    canEdit
      ? db.milestone.findMany({ where: { organizationId: context.organizationId, projectId: task.projectId }, select: { id: true, title: true }, orderBy: { sequenceNumber: "asc" } })
      : Promise.resolve([]),
    canEdit
      ? db.taskLabel.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href="/board" label="Task board" currentPage="Task details" />
      <header className="space-y-3">
        <p className="font-mono text-xs text-text-muted">{task.project.code}{task.taskNumber ? `-${task.taskNumber}` : ""} · {task.project.title}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{task.title}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={task.workflowStatus?.name ?? task.status} colorKey={task.workflowStatus?.category ?? task.status} />
          <StatusBadge status={task.priority} />
          {task.flaggedAt && <StatusBadge status="FLAGGED" />}
          {task.labels.map(({ label }) => <TaskLabelBadge key={label.id} name={label.name} color={label.color} />)}
        </div>
      </header>
      <section className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs text-text-muted">Milestone</dt><dd className="mt-1 text-sm text-text-primary">{task.milestone?.title ?? "None"}</dd></div>
          <div><dt className="text-xs text-text-muted">Discipline</dt><dd className="mt-1 text-sm text-text-primary">{task.requiredDiscipline ?? "Not specified"}</dd></div>
          <div><dt className="text-xs text-text-muted">Start</dt><dd className="mt-1 text-sm text-text-primary">{task.startDate ? formatDate(task.startDate) : "Not scheduled"}</dd></div>
          <div><dt className="text-xs text-text-muted">Due</dt><dd className="mt-1 text-sm text-text-primary">{task.dueDate ? formatDate(task.dueDate) : "Not scheduled"}</dd></div>
          <div><dt className="text-xs text-text-muted">Estimate / actual</dt><dd className="mt-1 text-sm tabular-nums text-text-primary">{task.estimatedHrs ?? "—"} / {task.actualHrs} hours</dd></div>
          <div><dt className="text-xs text-text-muted">Assignees</dt><dd className="mt-1 text-sm text-text-primary">{task.assignments.map(({ member }) => member.user.name ?? "Member").join(", ") || "Unassigned"}</dd></div>
        </dl>
        {task.flagReason && <p className="mt-4 rounded-md border border-warning-light bg-warning-light/40 px-3 py-2 text-sm text-warning-dark">Flag reason: {task.flagReason}</p>}
        {task.description && <p className="mt-4 whitespace-pre-wrap border-t border-border-default pt-4 text-sm leading-6 text-text-secondary">{task.description}</p>}
        <MetadataValuesDisplay fields={metadataFields} values={metadataValuesForFields(metadataFields, task.metadata ?? {})} unconfigured={unconfiguredMetadataValues(metadataFields, task.metadata ?? {})} />
      </section>
      {canEdit && <TaskEditControl projectId={task.projectId} task={task} workflowStatuses={task.project.workflow?.statuses ?? []} labels={labels} milestones={milestones} relatedTasks={projectTasks} members={members.map((member) => ({ id: member.id, name: member.user.name ?? "Member", discipline: member.discipline }))} metadataFields={metadataFields} initialMetadata={metadataValuesForFields(metadataFields, task.metadata ?? {})} />}
      {canMove && !canEdit && <TaskStatusControl projectId={task.projectId} taskId={task.id} initialWorkflowStatusId={task.workflowStatusId ?? ""} workflowStatuses={task.project.workflow?.statuses ?? []} initialActualHrs={task.actualHrs} />}
      {!canEdit && !canMove && <p className="rounded-lg border border-border-default bg-neutral-50 p-4 text-sm text-text-muted">Read-only task details. Ask a project lead or the assigned team member to make a change.</p>}
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
