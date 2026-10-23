import type { Metadata } from "next";
import { TaskPriority } from "@prisma/client";
import { TaskBoard } from "@/components/data-display/task-board";
import { TaskBoardAppliedFilters, TaskBoardFilters, type TaskBoardFilterField } from "@/components/data-display/task-board-filters";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { db } from "@/lib/db";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { taskFilterWhere, taskStatusFilterOptions, type TaskMetadataFilter } from "@/lib/task-filters";
import { metadataCsvHeaders } from "@/lib/metadata-csv";
import { serializeCsvRow } from "@/lib/csv";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Board" };

type BoardParams = Record<string, string | string[] | undefined>;

function parameterValues(value?: string | string[]) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function parameterValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function optionalDate(value?: string | string[], endOfDay = false) {
  value = parameterValue(value);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

function optionalNumber(value?: string | string[]) {
  value = parameterValue(value);
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function validMetadataFilter(field: { type: string; options?: string[] }, value: string) {
  if (field.type === "boolean") return value === "true" || value === "false";
  if (field.type === "number") return value.trim() !== "" && Number.isFinite(Number(value));
  if (field.type === "select" || field.type === "multi-select") return Boolean(field.options?.includes(value));
  if (field.type === "date") return Boolean(optionalDate(value));
  return value.trim() !== "";
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<BoardParams>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const search = parameterValue(params.q)?.trim().slice(0, 120) ?? "";
  const projectIds = parameterValues(params.project);
  const assigneeIds = parameterValues(params.assignee);
  const reporterIds = parameterValues(params.reporter);
  const priorities = parameterValues(params.priority).filter((value): value is TaskPriority => Object.values(TaskPriority).some((priority) => priority === value));
  const statusIds = parameterValues(params.status);
  const milestoneIds = parameterValues(params.milestone);
  const labelIds = parameterValues(params.label);
  const flaggedValue = parameterValue(params.flagged);
  const flagged = flaggedValue === "true" ? true : flaggedValue === "false" ? false : undefined;
  const parentValue = parameterValue(params.parent);
  const parent = parentValue === "has" || parentValue === "none" ? parentValue : undefined;
  const blockedValue = parameterValue(params.blocked);
  const blocked = blockedValue === "has" || blockedValue === "none" ? blockedValue : undefined;
  const disciplines = parameterValues(params.discipline).map((value) => value.trim().slice(0, 100)).filter(Boolean);
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "task");
  const metadataFilters: TaskMetadataFilter[] = metadataFields.flatMap((field): TaskMetadataFilter[] => {
    const values = parameterValues(params[`meta_${field.key}`]).filter((value) => validMetadataFilter(field, value));
    if (field.type === "multi-select") return values.length ? [{ field, values }] : [];
    const value = values[0];
    return value ? [{ field, value }] : [];
  });

  const [projects, members, milestones, labels, workflows, disciplineRows] = await Promise.all([
    db.project.findMany({
      where: { organizationId: context.organizationId },
      select: {
        id: true,
        code: true,
        title: true,
        workflow: {
          select: {
            id: true,
            name: true,
            statuses: {
              where: { isActive: true },
              select: { id: true, name: true, category: true, sortOrder: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: { title: "asc" },
    }),
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.milestone.findMany({
      where: { organizationId: context.organizationId, ...(projectIds.length ? { projectId: { in: projectIds } } : {}) },
      select: { id: true, title: true, project: { select: { code: true } } },
      orderBy: [{ project: { code: "asc" } }, { sequenceNumber: "asc" }],
    }),
    db.taskLabel.findMany({ where: { organizationId: context.organizationId }, orderBy: { name: "asc" } }),
    db.taskWorkflow.findMany({
      where: { organizationId: context.organizationId },
      select: {
        id: true,
        name: true,
        statuses: {
          where: { isActive: true },
          select: { id: true, name: true, category: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    db.task.findMany({
      where: { organizationId: context.organizationId, requiredDiscipline: { not: null } },
      select: { requiredDiscipline: true },
      distinct: ["requiredDiscipline"],
      orderBy: { requiredDiscipline: "asc" },
    }),
  ]);

  const selectedProjectIds = projectIds.filter((id) => projects.some((project) => project.id === id));
  const selectedStatuses = workflows
    .flatMap(({ statuses }) => statuses)
    .filter(({ id }) => statusIds.includes(id));
  const selectedAssignees = members.filter(({ id }) => assigneeIds.includes(id));
  const selectedReporters = members.filter(({ id }) => reporterIds.includes(id));
  const selectedMilestones = milestones.filter(({ id }) => milestoneIds.includes(id));
  const selectedLabels = labels.filter(({ id }) => labelIds.includes(id));
  const selectedDisciplines = disciplineRows.flatMap(({ requiredDiscipline }) =>
    requiredDiscipline && disciplines.some((value) => value.toLowerCase() === requiredDiscipline.toLowerCase())
      ? [requiredDiscipline]
      : [],
  );
  const startFrom = optionalDate(params.startFrom);
  const startTo = optionalDate(params.startTo, true);
  const dueFrom = optionalDate(params.dueFrom);
  const dueTo = optionalDate(params.dueTo, true);
  const createdFrom = optionalDate(params.createdFrom);
  const createdTo = optionalDate(params.createdTo, true);
  const updatedFrom = optionalDate(params.updatedFrom);
  const updatedTo = optionalDate(params.updatedTo, true);
  const completedFrom = optionalDate(params.completedFrom);
  const completedTo = optionalDate(params.completedTo, true);
  const estimateMin = optionalNumber(params.estimateMin);
  const estimateMax = optionalNumber(params.estimateMax);
  const actualMin = optionalNumber(params.actualMin);
  const actualMax = optionalNumber(params.actualMax);
  const where = taskFilterWhere(context.organizationId, {
    projectIds: selectedProjectIds,
    workflowStatusIds: selectedStatuses.map(({ id }) => id),
    priorities,
    milestoneIds: selectedMilestones.map(({ id }) => id),
    assigneeIds: selectedAssignees.map(({ id }) => id),
    reporterMemberIds: selectedReporters.map(({ id }) => id),
    currentMemberId: context.memberId,
    mine: parameterValue(params.mine) === "true",
    labelIds: selectedLabels.map(({ id }) => id),
    flagged,
    parent,
    blocked,
    requiredDisciplines: selectedDisciplines,
    search,
    startFrom,
    startTo,
    dueFrom,
    dueTo,
    createdFrom,
    createdTo,
    updatedFrom,
    updatedTo,
    completedFrom,
    completedTo,
    estimateMin,
    estimateMax,
    actualMin,
    actualMax,
    metadata: metadataFilters,
  });
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const tasks = await db.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
    select: {
      id: true,
      projectId: true,
      taskNumber: true,
      title: true,
      status: true,
      workflowStatusId: true,
      workflowStatus: { select: { id: true, name: true, category: true, sortOrder: true } },
      sortOrder: true,
      priority: true,
      dueDate: true,
      estimatedHrs: true,
      actualHrs: true,
      flaggedAt: true,
      flagReason: true,
      requiredDiscipline: true,
      project: {
        select: {
          id: true,
          code: true,
          title: true,
          workflow: {
            select: {
              id: true,
              name: true,
              statuses: {
                where: { isActive: true },
                select: { id: true, name: true, category: true, sortOrder: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
      milestone: { select: { id: true, title: true } },
      labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      assignments: {
        include: {
          member: {
            select: {
              id: true,
              discipline: true,
              user: { select: { name: true, image: true } },
              deploymentMemberships: {
                where: {
                  organizationId: context.organizationId,
                  deployment: { status: { in: ["ACTIVE", "UPCOMING"] }, startDate: { lte: today }, endDate: { gte: today } },
                },
                select: { deployment: { select: { status: true, startDate: true, endDate: true, location: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  const projectMemberships = roleAtLeast(context.role, "MANAGER")
    ? await db.projectMember.findMany({
        where: { organizationId: context.organizationId, memberId: context.memberId },
        select: { projectId: true },
      })
    : [];

  const workflowsForBoard = [...new Map(projects.flatMap(({ workflow }) => workflow ? [[workflow.id, workflow] as const] : [])).values()];
  const statusOptions = taskStatusFilterOptions(workflows.flatMap(({ statuses }) => statuses));
  const filterFields: TaskBoardFilterField[] = [
    { key: "parent", label: "Parent", kind: "options", options: [{ value: "has", label: "Has parent" }, { value: "none", label: "No parent" }] },
    { key: "assignee", label: "Assignee", kind: "options", multiple: true, options: members.map(({ id, user }) => ({ value: id, label: user.name ?? user.email })) },
    { key: "status", label: "Status", kind: "options", multiple: true, options: statusOptions },
    { key: "priority", label: "Priority", kind: "options", multiple: true, options: Object.values(TaskPriority).map((value) => ({ value, label: value })) },
    { key: "label", label: "Labels", kind: "options", multiple: true, options: labels.map(({ id, name }) => ({ value: id, label: name })) },
    { key: "project", label: "Project", kind: "options", multiple: true, options: projects.map(({ id, code, title }) => ({ value: id, label: `${code} · ${title}` })) },
    { key: "reporter", label: "Reporter", kind: "options", multiple: true, options: members.map(({ id, user }) => ({ value: id, label: user.name ?? user.email })) },
    { key: "milestone", label: "Milestone", kind: "options", multiple: true, options: milestones.map(({ id, title, project }) => ({ value: id, label: `${project.code} · ${title}` })) },
    { key: "blocked", label: "Blocked by", kind: "options", options: [{ value: "has", label: "Has blocker" }, { value: "none", label: "No blocker" }] },
    { key: "flagged", label: "Flag", kind: "options", options: [{ value: "true", label: "Flagged" }, { value: "false", label: "Not flagged" }] },
    { key: "discipline", label: "Required discipline", kind: "options", multiple: true, options: disciplineRows.flatMap(({ requiredDiscipline }) => requiredDiscipline ? [{ value: requiredDiscipline, label: requiredDiscipline }] : []) },
    { key: "mine", label: "My tasks", kind: "toggle" },
    { key: "q", label: "Search tasks", kind: "text" },
    { key: "startDate", label: "Start date", kind: "range", fromKey: "startFrom", toKey: "startTo", inputType: "date" },
    { key: "dueDate", label: "Due date", kind: "range", fromKey: "dueFrom", toKey: "dueTo", inputType: "date" },
    { key: "createdDate", label: "Created", kind: "range", fromKey: "createdFrom", toKey: "createdTo", inputType: "date" },
    { key: "updatedDate", label: "Updated", kind: "range", fromKey: "updatedFrom", toKey: "updatedTo", inputType: "date" },
    { key: "completedDate", label: "Completed", kind: "range", fromKey: "completedFrom", toKey: "completedTo", inputType: "date" },
    { key: "estimateHours", label: "Estimated hours", kind: "range", fromKey: "estimateMin", toKey: "estimateMax", inputType: "number", step: 0.25 },
    { key: "actualHours", label: "Actual hours", kind: "range", fromKey: "actualMin", toKey: "actualMax", inputType: "number", step: 0.25 },
    ...metadataFields.map((field): TaskBoardFilterField => {
      const key = `meta_${field.key}`;
      if (field.type === "boolean") return { key, label: field.label, kind: "options", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] };
      if (field.type === "select" || field.type === "multi-select") {
        return { key, label: field.label, kind: "options", multiple: field.type === "multi-select", options: (field.options ?? []).map((value) => ({ value, label: value })) };
      }
      return { key, label: field.label, kind: "value", inputType: field.type === "number" ? "number" : field.type === "date" ? "date" : "text" };
    }),
  ];
  const taskHeaders = ["projectCode", "taskNumber", "title", "description", "priority", "status", "milestoneSequence", "startDate", "dueDate", "estimatedHrs", "actualHrs", "requiredDiscipline", "assigneeEmails", "labels", "parentTaskNumber", "blockedByTaskNumber", ...metadataCsvHeaders(metadataFields).keys()];
  const taskTemplate = [
    serializeCsvRow(taskHeaders),
    serializeCsvRow(["PRJ-101", "12", "Review deliverables", "", "MEDIUM", "BACKLOG", "", "", "2026-11-13", "8", "0", "", "member@example.test", "Planning", "", "", ...metadataFields.map(() => "")]),
  ].join("\n");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Shared workspace</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Task board</h1>
          <p className="mt-2 text-sm text-text-secondary">Every project task is visible to the whole workspace. Filters focus the shared board; access rules control changes.</p>
        </div>
        {roleAtLeast(context.role, "MANAGER") && (
          <div className="flex w-full justify-end sm:w-auto">
            <CsvImportPanel
              title="Import tasks from CSV"
              endpoint="/api/tasks/import"
              template={taskTemplate}
              help="Use project code and optional task number to update an existing task. Separate assignee emails and labels with |. Workflow status names or keys are accepted."
            />
          </div>
        )}
      </header>
      <TaskBoard
        initialTasks={tasks}
        workflows={workflowsForBoard}
        canMoveAll={roleAtLeast(context.role, "ADMIN")}
        canMoveProjectIds={projectMemberships.map(({ projectId }) => projectId)}
        currentMemberId={context.memberId}
        filterKey={JSON.stringify(params)}
        filterControls={<TaskBoardFilters fields={filterFields} />}
        appliedFilters={<TaskBoardAppliedFilters fields={filterFields} />}
      />
    </div>
  );
}
