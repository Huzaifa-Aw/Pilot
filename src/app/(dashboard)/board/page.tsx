import type { Metadata } from "next";
import { TaskPriority } from "@prisma/client";
import { CompactFilters, type AppliedFilter } from "@/components/data-display/compact-filters";
import { TaskBoard } from "@/components/data-display/task-board";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { db } from "@/lib/db";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { taskFilterWhere, type TaskMetadataFilter } from "@/lib/task-filters";
import { metadataCsvHeaders } from "@/lib/metadata-csv";
import { serializeCsvRow } from "@/lib/csv";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Board" };

type BoardParams = {
  project?: string;
  assignee?: string;
  reporter?: string;
  status?: string;
  priority?: string;
  milestone?: string;
  label?: string;
  flagged?: string;
  parent?: string;
  blocked?: string;
  discipline?: string;
  dueFrom?: string;
  dueTo?: string;
  startFrom?: string;
  startTo?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  completedFrom?: string;
  completedTo?: string;
  estimateMin?: string;
  estimateMax?: string;
  actualMin?: string;
  actualMax?: string;
  mine?: string;
  q?: string;
} & Record<string, string | undefined>;

function optionalDate(value?: string, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

function optionalNumber(value?: string) {
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

function displayDateRange(from?: string, to?: string) {
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Through ${to}`;
  return "";
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<BoardParams>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const search = params.q?.trim().slice(0, 120) ?? "";
  const projectId = params.project?.trim() ?? "";
  const assigneeId = params.assignee?.trim() ?? "";
  const reporterId = params.reporter?.trim() ?? "";
  const selectedPriority = Object.values(TaskPriority).find((value) => value === params.priority);
  const statusId = params.status?.trim() ?? "";
  const milestoneId = params.milestone?.trim() ?? "";
  const labelId = params.label?.trim() ?? "";
  const flagged = params.flagged === "true" ? true : params.flagged === "false" ? false : undefined;
  const parent = params.parent === "has" || params.parent === "none" ? params.parent : undefined;
  const blocked = params.blocked === "has" || params.blocked === "none" ? params.blocked : undefined;
  const discipline = params.discipline?.trim().slice(0, 100) ?? "";
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "task");
  const metadataFilters: TaskMetadataFilter[] = metadataFields.flatMap((field) => {
    const value = params[`meta_${field.key}`];
    return value && validMetadataFilter(field, value) ? [{ field, value }] : [];
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
      where: { organizationId: context.organizationId, ...(projectId ? { projectId } : {}) },
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

  const project = projects.find(({ id }) => id === projectId);
  const selectedStatus = workflows
    .flatMap(({ statuses }) => statuses)
    .find(({ id }) => id === statusId && (!project || project.workflow?.statuses.some((status) => status.id === id)));
  const selectedMember = members.find(({ id }) => id === assigneeId);
  const selectedReporter = members.find(({ id }) => id === reporterId);
  const selectedMilestone = milestones.find(({ id }) => id === milestoneId);
  const selectedLabel = labels.find(({ id }) => id === labelId);
  const selectedDiscipline = disciplineRows.find(({ requiredDiscipline }) => requiredDiscipline === discipline)?.requiredDiscipline ?? "";
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
    projectId: project?.id,
    workflowStatusId: selectedStatus?.id,
    priority: selectedPriority,
    milestoneId: selectedMilestone?.id,
    assigneeId: selectedMember?.id,
    reporterMemberId: selectedReporter?.id,
    currentMemberId: context.memberId,
    mine: params.mine === "true",
    labelId: selectedLabel?.id,
    flagged,
    parent,
    blocked,
    requiredDiscipline: selectedDiscipline,
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

  const activeFilters: AppliedFilter[] = [
    { key: "q", label: "Search", value: search },
    { key: "project", label: "Project", value: project ? `${project.code} · ${project.title}` : "" },
    { key: "assignee", label: "Assignee", value: selectedMember?.user.name ?? selectedMember?.user.email ?? "" },
    { key: "reporter", label: "Reporter", value: selectedReporter?.user.name ?? selectedReporter?.user.email ?? "" },
    { key: "status", label: "Status", value: selectedStatus?.name ?? "" },
    { key: "priority", label: "Priority", value: selectedPriority ?? "" },
    { key: "milestone", label: "Milestone", value: selectedMilestone?.title ?? "" },
    { key: "label", label: "Label", value: selectedLabel?.name ?? "" },
    { key: "flagged", label: "Flag", value: flagged === true ? "Flagged" : flagged === false ? "Not flagged" : "" },
    { key: "parent", label: "Parent task", value: parent === "has" ? "Has parent" : parent === "none" ? "No parent" : "" },
    { key: "blocked", label: "Blocked by", value: blocked === "has" ? "Has blocker" : blocked === "none" ? "No blocker" : "" },
    { key: "mine", label: "Tasks", value: params.mine === "true" ? "My tasks" : "" },
    { key: "discipline", label: "Required discipline", value: selectedDiscipline },
    { key: ["startFrom", "startTo"], label: "Start date", value: displayDateRange(startFrom && params.startFrom, startTo && params.startTo) },
    { key: ["dueFrom", "dueTo"], label: "Due date", value: displayDateRange(dueFrom && params.dueFrom, dueTo && params.dueTo) },
    { key: ["createdFrom", "createdTo"], label: "Created", value: displayDateRange(createdFrom && params.createdFrom, createdTo && params.createdTo) },
    { key: ["updatedFrom", "updatedTo"], label: "Updated", value: displayDateRange(updatedFrom && params.updatedFrom, updatedTo && params.updatedTo) },
    { key: ["completedFrom", "completedTo"], label: "Completed", value: displayDateRange(completedFrom && params.completedFrom, completedTo && params.completedTo) },
    { key: ["estimateMin", "estimateMax"], label: "Estimated hours", value: estimateMin !== undefined || estimateMax !== undefined ? `${estimateMin ?? "0"}–${estimateMax ?? "any"}` : "" },
    { key: ["actualMin", "actualMax"], label: "Actual hours", value: actualMin !== undefined || actualMax !== undefined ? `${actualMin ?? "0"}–${actualMax ?? "any"}` : "" },
    ...metadataFilters.map(({ field, value }) => ({ key: `meta_${field.key}`, label: field.label, value })),
  ].filter((filter) => filter.value !== "");

  const fieldNames = [
    "q", "project", "assignee", "reporter", "status", "priority", "milestone", "label", "flagged", "parent", "blocked",
    "discipline", "mine", "startFrom", "startTo", "dueFrom", "dueTo", "createdFrom", "createdTo", "updatedFrom", "updatedTo",
    "completedFrom", "completedTo", "estimateMin", "estimateMax", "actualMin", "actualMax",
    ...metadataFields.map(({ key }) => `meta_${key}`),
  ];
  const workflowsForBoard = [...new Map(projects.flatMap(({ workflow }) => workflow ? [[workflow.id, workflow] as const] : [])).values()];
  const taskHeaders = ["projectCode", "taskNumber", "title", "description", "priority", "status", "milestoneSequence", "startDate", "dueDate", "estimatedHrs", "actualHrs", "requiredDiscipline", "assigneeEmails", "labels", "parentTaskNumber", "blockedByTaskNumber", ...metadataCsvHeaders(metadataFields).keys()];
  const taskTemplate = [
    serializeCsvRow(taskHeaders),
    serializeCsvRow(["PRJ-101", "12", "Review deliverables", "", "MEDIUM", "BACKLOG", "", "", "2026-11-13", "8", "0", "", "member@example.test", "Planning", "", "", ...metadataFields.map(() => "")]),
  ].join("\n");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Shared workspace</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Task board</h1>
        <p className="mt-2 text-sm text-text-secondary">Every project task is visible to the whole workspace. Filters focus the shared board; access rules control changes.</p>
      </header>
      {roleAtLeast(context.role, "MANAGER") && (
        <CsvImportPanel
          title="Import tasks from CSV"
          endpoint="/api/tasks/import"
          template={taskTemplate}
          help="Use project code and optional task number to update an existing task. Separate assignee emails and labels with |. Workflow status names or keys are accepted."
        />
      )}
      <CompactFilters pathname="/board" params={params} fieldNames={fieldNames} filters={activeFilters}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Search tasks</span><input name="q" defaultValue={search} placeholder="Title, description, project, or task number" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <SelectFilter label="Project" name="project" value={project?.id ?? ""} options={projects.map(({ id, code, title }) => ({ value: id, label: `${code} · ${title}` }))} />
          <SelectFilter label="Assignee" name="assignee" value={selectedMember?.id ?? ""} options={members.map(({ id, user }) => ({ value: id, label: user.name ?? user.email }))} />
          <SelectFilter label="Reporter" name="reporter" value={selectedReporter?.id ?? ""} options={members.map(({ id, user }) => ({ value: id, label: user.name ?? user.email }))} />
          <SelectFilter label="Status" name="status" value={selectedStatus?.id ?? ""} options={workflows.flatMap(({ statuses }) => statuses.map(({ id, name }) => ({ value: id, label: name }))).filter((option, index, all) => all.findIndex(({ value }) => value === option.value) === index)} />
          <SelectFilter label="Priority" name="priority" value={selectedPriority ?? ""} options={Object.values(TaskPriority).map((value) => ({ value, label: value }))} />
          <SelectFilter label="Milestone" name="milestone" value={selectedMilestone?.id ?? ""} options={milestones.map(({ id, title, project }) => ({ value: id, label: `${project.code} · ${title}` }))} />
          <SelectFilter label="Label" name="label" value={selectedLabel?.id ?? ""} options={labels.map(({ id, name }) => ({ value: id, label: name }))} />
          <SelectFilter label="Flag" name="flagged" value={params.flagged ?? ""} options={[{ value: "true", label: "Flagged" }, { value: "false", label: "Not flagged" }]} />
          <SelectFilter label="Parent task" name="parent" value={parent ?? ""} options={[{ value: "has", label: "Has parent" }, { value: "none", label: "No parent" }]} />
          <SelectFilter label="Blocked by" name="blocked" value={blocked ?? ""} options={[{ value: "has", label: "Has blocker" }, { value: "none", label: "No blocker" }]} />
          <SelectFilter label="Required discipline" name="discipline" value={selectedDiscipline} options={disciplineRows.flatMap(({ requiredDiscipline }) => requiredDiscipline ? [{ value: requiredDiscipline, label: requiredDiscipline }] : [])} />
          {(["startFrom", "startTo", "dueFrom", "dueTo", "createdFrom", "createdTo", "updatedFrom", "updatedTo", "completedFrom", "completedTo"] as const).map((name) => (
            <label key={name} className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">{dateLabel(name)}</span><input type="date" name={name} defaultValue={params[name] ?? ""} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          ))}
          {(["estimateMin", "estimateMax", "actualMin", "actualMax"] as const).map((name) => (
            <label key={name} className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">{numberLabel(name)}</span><input type="number" min="0" step="0.25" name={name} defaultValue={params[name] ?? ""} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary"><input type="checkbox" name="mine" value="true" defaultChecked={params.mine === "true"} className="size-4 accent-brand-primary" /> My tasks</label>
          {metadataFields.map((field) => <MetadataFilter field={field} key={field.key} value={params[`meta_${field.key}`] ?? ""} />)}
        </div>
      </CompactFilters>
      <TaskBoard
        initialTasks={tasks}
        workflows={workflowsForBoard}
        canMoveAll={roleAtLeast(context.role, "ADMIN")}
        canMoveProjectIds={projectMemberships.map(({ projectId }) => projectId)}
        currentMemberId={context.memberId}
      />
    </div>
  );
}

function SelectFilter({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <select name={name} defaultValue={value} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
        <option value="">All {label.toLowerCase()}</option>
        {options.map(({ value: optionValue, label: optionLabel }) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function MetadataFilter({ field, value }: { field: Awaited<ReturnType<typeof getDefaultMetadataFields>>[number]; value: string }) {
  const name = `meta_${field.key}`;
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-text-secondary">{field.label}</span>
      {field.type === "boolean" ? (
        <select name={name} defaultValue={value} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select>
      ) : field.type === "select" || field.type === "multi-select" ? (
        <select name={name} defaultValue={value} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">Any</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>
      ) : (
        <input name={name} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} defaultValue={value} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
      )}
    </label>
  );
}

function dateLabel(name: string) {
  const labels: Record<string, string> = {
    startFrom: "Start date from", startTo: "Start date to",
    dueFrom: "Due date from", dueTo: "Due date to",
    createdFrom: "Created from", createdTo: "Created to",
    updatedFrom: "Updated from", updatedTo: "Updated to",
    completedFrom: "Completed from", completedTo: "Completed to",
  };
  return labels[name] ?? name;
}

function numberLabel(name: string) {
  const labels: Record<string, string> = {
    estimateMin: "Estimated hours from", estimateMax: "Estimated hours to",
    actualMin: "Actual hours from", actualMax: "Actual hours to",
  };
  return labels[name] ?? name;
}
