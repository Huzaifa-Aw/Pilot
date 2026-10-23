import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, Pencil, Plus, UsersRound } from "lucide-react";
import { MilestoneCreateForm, MilestoneStatusControl } from "@/components/forms/milestone-form";
import { MetadataValuesDisplay } from "@/components/forms/metadata-fields-editor";
import { TaskCreateForm, TaskStatusControl } from "@/components/forms/task-form";
import { MilestoneEditControl, TaskEditControl } from "@/components/forms/work-item-edit-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { TaskLabelBadge } from "@/components/data-display/task-label-badge";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { getDefaultMetadataFields, metadataValuesForFields, unconfiguredMetadataValues } from "@/lib/metadata";
import { resolveTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Project details" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const { projectId } = await params;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

  const [project, members, milestoneMetadataFields, taskMetadataFields, projectMetadataFields, taskLabels] = await Promise.all([
    db.project.findFirst({
      where: { id: projectId, organizationId: context.organizationId },
      include: {
        workflow: {
          include: {
            statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
          },
        },
        milestones: { orderBy: { sequenceNumber: "asc" } },
        tasks: {
          orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
          include: {
            workflowStatus: { select: { id: true, name: true, category: true, sortOrder: true } },
            labels: { include: { label: { select: { id: true, name: true, color: true } } } },
            assignments: {
              include: {
                member: {
                  select: {
                    id: true,
                    discipline: true,
                    user: { select: { name: true } },
                    deploymentMemberships: {
                      where: {
                        organizationId: context.organizationId,
                        deployment: { status: { in: ["ACTIVE", "UPCOMING"] }, startDate: { lte: today }, endDate: { gte: today } },
                      },
                      include: { deployment: { select: { status: true, startDate: true, endDate: true, location: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, discipline: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    getDefaultMetadataFields(context.organizationId, "milestone"),
    getDefaultMetadataFields(context.organizationId, "task"),
    getDefaultMetadataFields(context.organizationId, "project"),
    db.taskLabel.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  if (!project) notFound();
  if (!(await can(context, "project.read", { projectId }))) notFound();

  const canEdit = await can(context, "project.update", { projectId });
  const canCreateMilestones = await can(context, "milestone.create", { projectId });
  const canCreateTasks = await can(context, "task.create", { projectId });
  const canMoveTasks = new Map(await Promise.all(project.tasks.map(async (task) => [
    task.id,
    await can(context, "task.update", { projectId }) || await can(context, "task.move", { projectId, taskAssigneeIds: task.assignments.map(({ memberId }) => memberId) }),
  ] as const)));
  const memberOptions = members.map((member) => ({
    id: member.id,
    name: member.user.name ?? "Organization member",
    discipline: member.discipline,
  }));
  const milestoneOptions = project.milestones.map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
  }));

  return (
    <div className="space-y-7">
      <BackLink href="/projects" label="Projects" currentPage="Project details" />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs text-text-muted">{project.code}</p>
            <StatusBadge status={project.status} />
          </div>
          <h1 className="mt-2 break-words font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {project.title}
          </h1>
          {project.description && <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-text-secondary">{project.description}</p>}
          <MetadataValuesDisplay
            fields={projectMetadataFields}
            values={metadataValuesForFields(projectMetadataFields, project.metadata ?? {})}
            unconfigured={unconfiguredMetadataValues(projectMetadataFields, project.metadata ?? {})}
          />
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={`/projects/${project.id}/allocations`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border-default bg-surface px-4 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-neutral-50">
              <UsersRound size={15} aria-hidden="true" /> Plan capacity
            </Link>
            <Link href={`/projects/${project.id}/settings`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border-default bg-surface px-4 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-neutral-50">
              <Pencil size={15} aria-hidden="true" /> Edit project
            </Link>
          </div>
        )}
      </header>

      <section aria-label="Project details" className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <CalendarDays className="text-brand-primary" size={19} aria-hidden="true" />
          <div>
            <p className="text-xs text-text-muted">Schedule</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{formatDateRange(project.startDate, project.endDate)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <ClipboardList className="text-brand-primary" size={19} aria-hidden="true" />
          <div>
            <p className="text-xs text-text-muted">Work items</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{project.tasks.length} tasks · {project.milestones.length} milestones</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <UsersRound className="text-brand-primary" size={19} aria-hidden="true" />
          <div>
            <p className="text-xs text-text-muted">Budgeted hours</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">{project.budgetHours ?? "Not set"}</p>
          </div>
        </Card>
      </section>

      <section id="milestones" aria-labelledby="milestones-title" className="scroll-mt-20">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Progress checkpoints</p>
            <h2 id="milestones-title" className="mt-1 font-heading text-xl font-semibold text-text-primary">Milestones</h2>
          </div>
          <span className="text-xs text-text-muted">{project.milestones.length} total</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {project.milestones.map((milestone) => (
            <Card key={milestone.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-text-muted">#{milestone.sequenceNumber}</span>
                    <StatusBadge status={milestone.status} />
                    {milestone.requiresSignoff && <span className="text-xs font-medium text-text-muted">Signoff required</span>}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-text-primary">{milestone.title}</h3>
                  {milestone.description && <p className="mt-1 text-sm leading-5 text-text-secondary">{milestone.description}</p>}
                  <MetadataValuesDisplay
                    fields={milestoneMetadataFields}
                    values={metadataValuesForFields(milestoneMetadataFields, milestone.metadata ?? {})}
                    unconfigured={unconfiguredMetadataValues(milestoneMetadataFields, milestone.metadata ?? {})}
                  />
                  <p className="mt-2 text-xs text-text-muted">
                    {milestone.targetDate ? `Target ${formatDate(milestone.targetDate)}` : "No target date"}
                    {" · "}{Math.round(milestone.completionPct)}% complete
                  </p>
                </div>
                {(canEdit || canCreateMilestones) && <div className="w-full shrink-0 sm:w-44"><MilestoneStatusControl projectId={project.id} milestone={milestone} members={memberOptions} /></div>}
                {!canEdit && <p className="text-xs text-text-muted">Read-only — ask a project lead or administrator to edit this milestone.</p>}
              </div>
              {canEdit && <MilestoneEditControl projectId={project.id} milestone={milestone} metadataFields={milestoneMetadataFields} initialMetadata={metadataValuesForFields(milestoneMetadataFields, milestone.metadata ?? {})} />}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <progress
                  aria-label={`${milestone.title} completion`}
                  className="h-1.5 w-full accent-brand-primary"
                  max={100}
                  value={Math.max(0, Math.min(100, milestone.completionPct))}
                />
              </div>
            </Card>
          ))}
          {project.milestones.length === 0 && (
            <Card className="px-5 py-8 text-center">
              <p className="text-sm font-semibold text-text-primary">No milestones yet</p>
              <p className="mt-1 text-sm text-text-muted">Add checkpoints to make project progress easier to follow.</p>
            </Card>
          )}
        </div>
        {canEdit && canCreateMilestones && (
          <details className="mt-3 rounded-lg border border-border-default bg-surface">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-brand-primary">
              <Plus size={16} aria-hidden="true" /> Add milestone
            </summary>
            <div className="border-t border-border-default p-3 sm:p-4">
              <MilestoneCreateForm projectId={project.id} metadataFields={milestoneMetadataFields} />
            </div>
          </details>
        )}
      </section>

      <section id="tasks" aria-labelledby="tasks-title" className="scroll-mt-20">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Action items</p>
            <h2 id="tasks-title" className="mt-1 font-heading text-xl font-semibold text-text-primary">Tasks</h2>
          </div>
          <span className="text-xs text-text-muted">{project.tasks.length} total</span>
        </div>
        <div className="mt-4 space-y-3">
          {project.tasks.map((task) => (
            <Card key={task.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={task.workflowStatus?.name ?? task.status} colorKey={task.workflowStatus?.category ?? task.status} />
                    <StatusBadge status={task.priority} showDot={false} />
                    {task.taskNumber !== null && <span className="font-mono text-xs text-text-muted">{project.code}-{task.taskNumber}</span>}
                    {task.requiredDiscipline && <span className="text-xs text-text-muted">Requires {task.requiredDiscipline}</span>}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-text-primary">{task.title}</h3>
                  {task.description && <p className="mt-1 text-sm leading-5 text-text-secondary">{task.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.labels.map(({ label }) => <TaskLabelBadge key={label.id} name={label.name} color={label.color} />)}
                    {task.assignments.map((assignment) => {
                      const mismatch = Boolean(task.requiredDiscipline && task.requiredDiscipline.trim().toLowerCase() !== (assignment.member.discipline ?? "").trim().toLowerCase());
                      return (
                        <span key={assignment.memberId} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-neutral-100 px-2.5 text-xs text-text-secondary">
                          {assignment.member.user.name ?? "Member"}
                          {mismatch && <span className="font-semibold text-warning-dark" title="Member discipline differs from the task requirement">· discipline differs</span>}
                        </span>
                      );
                    })}
                    {task.assignments.length === 0 && <span className="text-xs text-text-muted">Unassigned</span>}
                  </div>
                  {task.assignments.flatMap((assignment) => assignment.member.deploymentMemberships.map(({ deployment }, index) => <OnDeploymentBadge key={`${task.id}-${assignment.memberId}-${index}`} status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} />))}
                </div>
                {canMoveTasks.get(task.id) ? (
                  <TaskStatusControl projectId={project.id} taskId={task.id} initialWorkflowStatusId={task.workflowStatusId ?? ""} workflowStatuses={project.workflow?.statuses ?? []} initialActualHrs={task.actualHrs} />
                ) : (
                  <div className="space-y-1"><StatusBadge status={task.status} /><p className="text-xs text-text-muted">Read-only — only project members assigned to this task can move it.</p></div>
                )}
              </div>
              {canEdit && <TaskEditControl projectId={project.id} task={task} workflowStatuses={project.workflow?.statuses ?? []} labels={taskLabels} milestones={milestoneOptions} relatedTasks={project.tasks.filter((item) => item.id !== task.id).map((item) => ({ id: item.id, title: item.title, taskNumber: item.taskNumber }))} members={memberOptions} metadataFields={taskMetadataFields} initialMetadata={metadataValuesForFields(taskMetadataFields, task.metadata ?? {})} />}
            </Card>
          ))}
          {project.tasks.length === 0 && (
            <Card className="px-5 py-8 text-center">
              <p className="text-sm font-semibold text-text-primary">No tasks yet</p>
              <p className="mt-1 text-sm text-text-muted">Break the next deliverable into actions your team can take.</p>
            </Card>
          )}
        </div>
        {canCreateTasks && (
          <details className="mt-3 rounded-lg border border-border-default bg-surface">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-brand-primary">
              <Plus size={16} aria-hidden="true" /> Add task
            </summary>
            <div className="border-t border-border-default p-3 sm:p-4">
              <TaskCreateForm projectId={project.id} milestones={milestoneOptions} members={memberOptions} workflowStatuses={project.workflow?.statuses ?? []} labels={taskLabels} metadataFields={taskMetadataFields} />
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

function formatDateRange(start: Date | null, end: Date | null) {
  if (!start && !end) return "Not scheduled";
  return `${start ? formatDate(start) : "Start not set"} – ${end ? formatDate(end) : "End not set"}`;
}
