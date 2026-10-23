import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, Pencil, UsersRound } from "lucide-react";
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
import { milestoneProgressPercent } from "@/lib/milestone-progress";
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
  const taskCountsByMilestone = new Map<string, { total: number; completed: number }>();
  for (const task of project.tasks) {
    if (!task.milestoneId) continue;
    const counts = taskCountsByMilestone.get(task.milestoneId) ?? { total: 0, completed: 0 };
    counts.total += 1;
    if (task.status === "COMPLETED") counts.completed += 1;
    taskCountsByMilestone.set(task.milestoneId, counts);
  }

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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <section id="milestones" aria-labelledby="milestones-title" className="scroll-mt-20 min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Progress checkpoints</p>
              <h2 id="milestones-title" className="mt-1 font-heading text-lg font-semibold text-text-primary">Milestones</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">{project.milestones.length} total</span>
              {canEdit && canCreateMilestones && <MilestoneCreateForm projectId={project.id} metadataFields={milestoneMetadataFields} />}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-md border border-border-default bg-surface">
            <table className="w-full min-w-[440px] border-collapse text-left text-xs">
              <thead className="bg-neutral-50 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                <tr>
                  <th scope="col" className="px-2 py-2">Checkpoint</th>
                  <th scope="col" className="px-2 py-2">Status</th>
                  <th scope="col" className="px-2 py-2">Target</th>
                  <th scope="col" className="px-2 py-2">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {project.milestones.map((milestone) => {
                  const taskCounts = taskCountsByMilestone.get(milestone.id) ?? { total: 0, completed: 0 };
                  const progress = milestoneProgressPercent(taskCounts.completed, taskCounts.total);
                  const metadataValues = metadataValuesForFields(milestoneMetadataFields, milestone.metadata ?? {});
                  const extraMetadata = unconfiguredMetadataValues(milestoneMetadataFields, milestone.metadata ?? {});
                  return (
                    <tr key={milestone.id} className="align-middle transition-colors duration-150 hover:bg-neutral-50/70">
                      <td className="max-w-[14rem] px-2 py-2">
                        <span className="font-mono text-[9px] font-semibold text-text-muted">MS-{String(milestone.sequenceNumber).padStart(2, "0")}</span>
                        <h3 className="mt-0.5 text-xs font-semibold text-text-primary">{milestone.title}</h3>
                        {milestone.description && <p className="mt-0.5 line-clamp-1 text-[10px] text-text-secondary">{milestone.description}</p>}
                        {canEdit && <MilestoneEditControl projectId={project.id} milestone={milestone} metadataFields={milestoneMetadataFields} initialMetadata={metadataValues} />}
                        {(Object.keys(metadataValues).length > 0 || Object.keys(extraMetadata).length > 0) && (
                          <details className="mt-1">
                            <summary className="inline-flex min-h-6 cursor-pointer list-none items-center text-[10px] font-medium text-text-muted hover:text-text-secondary [&::-webkit-details-marker]:hidden">Metadata</summary>
                            <MetadataValuesDisplay fields={milestoneMetadataFields} values={metadataValues} unconfigured={extraMetadata} />
                          </details>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={milestone.status} />
                          {(canEdit || canCreateMilestones) && <MilestoneStatusControl projectId={project.id} milestone={milestone} members={memberOptions} compact />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[10px] text-text-secondary">
                        {milestone.targetDate ? formatDate(milestone.targetDate) : "—"}
                      </td>
                      <td className="min-w-14 px-2 py-2">
                        <span className="text-[10px] tabular-nums text-text-secondary">{progress}</span>
                      </td>
                    </tr>
                  );
                })}
                {project.milestones.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center">
                      <p className="text-xs font-semibold text-text-primary">No milestones yet</p>
                      <p className="mt-1 text-[10px] text-text-muted">Add checkpoints to track delivery progress.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="tasks" aria-labelledby="tasks-title" className="scroll-mt-20 min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Action items</p>
              <h2 id="tasks-title" className="mt-1 font-heading text-lg font-semibold text-text-primary">Tasks</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">{project.tasks.length} total</span>
              {canCreateTasks && <TaskCreateForm projectId={project.id} milestones={milestoneOptions} members={memberOptions} workflowStatuses={project.workflow?.statuses ?? []} labels={taskLabels} metadataFields={taskMetadataFields} />}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-md border border-border-default bg-surface">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead className="bg-neutral-50 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                <tr>
                  <th scope="col" className="px-2 py-2">Work item</th>
                  <th scope="col" className="px-2 py-2">Status</th>
                  <th scope="col" className="px-2 py-2">Owner</th>
                  <th scope="col" className="px-2 py-2">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {project.tasks.map((task) => {
                  const ownerNames = task.assignments.map(({ member }) => member.user.name ?? "Member");
                  const statusName = task.workflowStatus?.name ?? task.status;
                  const canMove = canMoveTasks.get(task.id) ?? false;
                  return (
                    <tr key={task.id} className="align-middle transition-colors duration-150 hover:bg-neutral-50/70">
                      <td className="max-w-[22rem] px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-mono text-[9px] font-semibold text-text-muted">{task.taskNumber !== null ? `${project.code}-${task.taskNumber}` : project.code}</span>
                          <span className="text-[9px] font-semibold text-text-secondary">{task.priority.toLowerCase()}</span>
                          {task.flaggedAt && <StatusBadge status="FLAGGED" />}
                        </div>
                        <h3 className="mt-0.5 line-clamp-1 text-xs font-semibold text-text-primary">{task.title}</h3>
                        {task.description && <p className="mt-0.5 line-clamp-1 text-[10px] text-text-secondary">{task.description}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {task.labels.slice(0, 2).map(({ label }) => <TaskLabelBadge key={label.id} name={label.name} color={label.color} />)}
                          {task.labels.length > 2 && <span className="text-[9px] text-text-muted">+{task.labels.length - 2} labels</span>}
                          {task.requiredDiscipline && <span className="text-[9px] text-text-muted">Requires {task.requiredDiscipline}</span>}
                        </div>
                        {canEdit && <TaskEditControl projectId={project.id} task={task} workflowStatuses={project.workflow?.statuses ?? []} labels={taskLabels} milestones={milestoneOptions} relatedTasks={project.tasks.filter((item) => item.id !== task.id).map((item) => ({ id: item.id, title: item.title, taskNumber: item.taskNumber }))} members={memberOptions} metadataFields={taskMetadataFields} initialMetadata={metadataValuesForFields(taskMetadataFields, task.metadata ?? {})} />}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={statusName} colorKey={task.workflowStatus?.category ?? task.status} />
                          {canMove && <TaskStatusControl projectId={project.id} taskId={task.id} initialWorkflowStatusId={task.workflowStatusId ?? ""} workflowStatuses={project.workflow?.statuses ?? []} initialActualHrs={task.actualHrs} compact />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[10px] text-text-secondary">
                        {ownerNames.length ? <>{ownerNames[0]}{ownerNames.length > 1 ? ` +${ownerNames.length - 1}` : ""}</> : "Unassigned"}
                        {task.assignments.flatMap((assignment) => assignment.member.deploymentMemberships.map(({ deployment }, index) => <OnDeploymentBadge key={`${task.id}-${assignment.memberId}-${index}`} status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} />))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-[10px] text-text-secondary">
                        {task.dueDate ? formatDate(task.dueDate) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {project.tasks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center">
                      <p className="text-xs font-semibold text-text-primary">No tasks yet</p>
                      <p className="mt-1 text-[10px] text-text-muted">Add an action item for the project team.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
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
