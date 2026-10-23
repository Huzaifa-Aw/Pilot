import { AuditAction, Prisma, TaskStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getDefaultMetadataFields, prepareMetadataValues } from "@/lib/metadata";
import { metadataCsvHeaders, parseMetadataCsvValues } from "@/lib/metadata-csv";
import { CsvImportError, parseCsvTable } from "@/lib/csv";
import { isWorkflowTransitionAllowed, missingRequiredTaskFields, requiredTaskFieldLabels } from "@/lib/task-workflows";
import { wouldCreateTaskDependencyCycle } from "@/lib/task-dependencies";
import { TASK_PRIORITIES } from "@/lib/constants";
import { taskCreateSchema } from "@/lib/validations/task";

type PreparedTaskRow = {
  rowNumber: number;
  projectId: string;
  projectCode: string;
  workflowStatusId: string;
  status: TaskStatus;
  taskNumber: number | null;
  taskId: string | null;
  action: "CREATE" | "UPDATE";
  summary: string;
  data: {
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: (typeof TASK_PRIORITIES)[number];
    startDate: Date | null;
    dueDate: Date | null;
    estimatedHrs: number | null;
    actualHrs: number;
    requiredDiscipline: string | null;
    milestoneId: string | null;
    parentTaskId: string | null;
    blockedByTaskId: string | null;
    assigneeIds: string[];
    labelIds: string[];
    metadata: Prisma.InputJsonObject;
  };
  raw: Record<string, string>;
};

function optionalDate(value: string | undefined) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "task_import", status, error, code,
  });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    throw error;
  }
  if (!body || typeof body !== "object" || !("csv" in body) || typeof body.csv !== "string") {
    return fail(422, "Choose a CSV file to import.", "VALIDATION_ERROR");
  }
  const mode = "mode" in body && body.mode === "commit" ? body.mode : "preview";
  if ("mode" in body && body.mode !== "preview" && body.mode !== "commit") return fail(422, "Choose preview or confirm the import.", "VALIDATION_ERROR");
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "task");
  const customHeaders = metadataCsvHeaders(metadataFields);
  const table = parseCsvTable(body.csv);
  if (table.error) return fail(422, table.error, "VALIDATION_ERROR");
  const required = ["projectCode", "title"];
  const supported = new Set(["projectCode", "taskNumber", "title", "description", "priority", "status", "milestoneSequence", "dueDate", "startDate", "estimatedHrs", "actualHrs", "requiredDiscipline", "assigneeEmails", "labels", ...customHeaders.keys()]);
  if (required.some((header) => !table.headers.includes(header)) || table.headers.some((header) => !supported.has(header))) {
    return fail(422, "Use the downloaded task template headers.", "VALIDATION_ERROR");
  }
  const projectCodes = [...new Set(table.rows.map(({ values }) => values.projectCode.trim().toUpperCase()))];
  const emails = [...new Set(table.rows.flatMap(({ values }) => (values.assigneeEmails ?? "").split("|").map((email) => email.trim().toLowerCase()).filter(Boolean)))];
  const labelNames = [...new Set(table.rows.flatMap(({ values }) => (values.labels ?? "").split("|").map((name) => name.trim()).filter(Boolean)))];
  const [projects, members, labels] = await Promise.all([
    db.project.findMany({
      where: { organizationId: context.organizationId, code: { in: projectCodes } },
      include: {
        workflow: { include: { statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }, transitions: true } },
        milestones: { select: { id: true, sequenceNumber: true, title: true } },
      },
    }),
    db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true, user: { email: { in: emails } } }, select: { id: true, user: { select: { email: true } } } }),
    db.taskLabel.findMany({ where: { organizationId: context.organizationId, name: { in: labelNames } }, select: { id: true, name: true } }),
  ]);
  const projectByCode = new Map(projects.map((project) => [project.code.toUpperCase(), project]));
  const memberByEmail = new Map(members.map((member) => [member.user.email.toLowerCase(), member]));
  const labelByName = new Map(labels.map((label) => [label.name.toLowerCase(), label]));
  const projectIds = projects.map(({ id }) => id);
  const relatedNumbers = table.rows.flatMap(({ values }) => [values.parentTaskNumber, values.blockedByTaskNumber]
    .filter((value): value is string => Boolean(value && value !== "-"))
    .map(Number)
    .filter((number) => Number.isSafeInteger(number) && number > 0));
  const [relatedTasks, dependencyTasks] = await Promise.all([
    relatedNumbers.length
      ? db.task.findMany({ where: { organizationId: context.organizationId, projectId: { in: projectIds }, taskNumber: { in: relatedNumbers } }, select: { id: true, projectId: true, taskNumber: true } })
      : Promise.resolve([]),
    db.task.findMany({ where: { organizationId: context.organizationId, projectId: { in: projectIds } }, select: { id: true, parentTaskId: true, blockedByTaskId: true } }),
  ]);
  const relatedByKey = new Map(relatedTasks.map((task) => [`${task.projectId}:${task.taskNumber}`, task]));
  const seenKeys = new Set<string>();
  const rows: PreparedTaskRow[] = [];

  for (const row of table.rows) {
    const projectCode = row.values.projectCode.trim().toUpperCase();
    const project = projectByCode.get(projectCode);
    if (!project || !project.workflow) return fail(422, `Row ${row.rowNumber}: choose a project with an assigned workflow.`, "NOT_FOUND");
    const canEditProject = await can(context, "task.update", { projectId: project.id });
    const canCreateInProject = await can(context, "task.create", { projectId: project.id });
    if (!canEditProject && !canCreateInProject) return fail(403, `Row ${row.rowNumber}: you do not have access to change tasks in this project.`, "FORBIDDEN");
    const taskNumber = row.values.taskNumber ? Number(row.values.taskNumber) : null;
    if (taskNumber !== null && (!Number.isSafeInteger(taskNumber) || taskNumber < 1)) return fail(422, `Row ${row.rowNumber}: taskNumber must be a positive whole number.`, "VALIDATION_ERROR");
    const rowKey = `${project.id}:${taskNumber ?? `new-${row.rowNumber}`}`;
    if (seenKeys.has(rowKey)) return fail(409, `Row ${row.rowNumber}: the CSV repeats a project and task number.`, "CONFLICT");
    seenKeys.add(rowKey);
    const existing = taskNumber === null ? null : await db.task.findFirst({
      where: { organizationId: context.organizationId, projectId: project.id, taskNumber },
      include: { assignments: { select: { memberId: true } }, labels: { select: { labelId: true, label: { select: { name: true } } } } },
    });
    if (existing && !canEditProject) return fail(403, `Row ${row.rowNumber}: only a project manager can update an existing task.`, "FORBIDDEN");
    const workflowStatus = row.values.status
      ? project.workflow.statuses.find(({ key, name }) => key.toLowerCase() === row.values.status.toLowerCase() || name.toLowerCase() === row.values.status.toLowerCase())
      : existing
        ? project.workflow.statuses.find(({ id }) => id === existing.workflowStatusId)
        : project.workflow.statuses.find(({ isInitial }) => isInitial);
    if (!workflowStatus) return fail(422, `Row ${row.rowNumber}: status does not exist in the project's workflow.`, "VALIDATION_ERROR");
    const priority = row.values.priority ? TASK_PRIORITIES.find((value) => value === row.values.priority.toUpperCase()) : existing?.priority ?? "MEDIUM";
    if (!priority) return fail(422, `Row ${row.rowNumber}: choose a valid priority.`, "VALIDATION_ERROR");
    const startDate = row.values.startDate ? optionalDate(row.values.startDate) : existing?.startDate ?? null;
    const dueDate = row.values.dueDate ? optionalDate(row.values.dueDate) : existing?.dueDate ?? null;
    if ((row.values.startDate && !startDate) || (row.values.dueDate && !dueDate)) return fail(422, `Row ${row.rowNumber}: use valid YYYY-MM-DD dates.`, "VALIDATION_ERROR");
    const estimatedHrs = row.values.estimatedHrs === undefined || row.values.estimatedHrs === "" ? existing?.estimatedHrs ?? null : Number(row.values.estimatedHrs);
    const actualHrs = row.values.actualHrs === undefined || row.values.actualHrs === "" ? existing?.actualHrs ?? 0 : Number(row.values.actualHrs);
    if ((estimatedHrs !== null && (!Number.isFinite(estimatedHrs) || estimatedHrs < 0)) || !Number.isFinite(actualHrs) || actualHrs < 0) return fail(422, `Row ${row.rowNumber}: hour values must be zero or greater.`, "VALIDATION_ERROR");
    const assigneeEmails = (row.values.assigneeEmails ?? "").split("|").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const assigneeIds = row.values.assigneeEmails?.trim() === "-"
      ? []
      : assigneeEmails.length
        ? assigneeEmails.map((email) => memberByEmail.get(email)?.id)
        : existing?.assignments.map(({ memberId }) => memberId) ?? [];
    if (assigneeIds.some((id) => !id)) return fail(422, `Row ${row.rowNumber}: an assignee email is not an active member of this organization.`, "VALIDATION_ERROR");
    const labelNamesInRow = (row.values.labels ?? "").split("|").map((name) => name.trim()).filter(Boolean);
    const labelIds = row.values.labels?.trim() === "-"
      ? []
      : labelNamesInRow.length
        ? labelNamesInRow.map((name) => labelByName.get(name.toLowerCase())?.id)
        : existing?.labels.map(({ labelId }) => labelId) ?? [];
    if (labelIds.some((id) => !id)) return fail(422, `Row ${row.rowNumber}: a task label is not configured in this organization.`, "VALIDATION_ERROR");
    const milestoneSequence = row.values.milestoneSequence ? Number(row.values.milestoneSequence) : null;
    if (milestoneSequence !== null && (!Number.isSafeInteger(milestoneSequence) || milestoneSequence < 1)) return fail(422, `Row ${row.rowNumber}: milestoneSequence must be a positive whole number.`, "VALIDATION_ERROR");
    const milestone = milestoneSequence === null
      ? existing?.milestoneId ?? null
      : project.milestones.find(({ sequenceNumber }) => sequenceNumber === milestoneSequence)?.id;
    if (milestoneSequence !== null && !milestone) return fail(422, `Row ${row.rowNumber}: milestone sequence does not exist in this project.`, "NOT_FOUND");
    const relatedTaskId = (field: "parentTaskNumber" | "blockedByTaskNumber", current: string | null) => {
      const value = row.values[field]?.trim();
      if (!value) return current;
      if (value === "-") return null;
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 1) return undefined;
      return relatedByKey.get(`${project.id}:${number}`)?.id;
    };
    const parentTaskId = relatedTaskId("parentTaskNumber", existing?.parentTaskId ?? null);
    const blockedByTaskId = relatedTaskId("blockedByTaskNumber", existing?.blockedByTaskId ?? null);
    if (parentTaskId === undefined || blockedByTaskId === undefined) return fail(422, `Row ${row.rowNumber}: parent and blocker numbers must identify tasks in this project.`, "VALIDATION_ERROR");
    if (existing && parentTaskId && parentTaskId !== existing.parentTaskId &&
      wouldCreateTaskDependencyCycle(existing.id, parentTaskId, dependencyTasks.map(({ id, parentTaskId }) => ({ id, dependencyId: parentTaskId })))) {
      return fail(422, `Row ${row.rowNumber}: parent task would create a dependency cycle.`, "VALIDATION_ERROR");
    }
    if (existing && blockedByTaskId && blockedByTaskId !== existing.blockedByTaskId &&
      wouldCreateTaskDependencyCycle(existing.id, blockedByTaskId, dependencyTasks.map(({ id, blockedByTaskId }) => ({ id, dependencyId: blockedByTaskId })))) {
      return fail(422, `Row ${row.rowNumber}: blocker would create a dependency cycle.`, "VALIDATION_ERROR");
    }
    const custom = parseMetadataCsvValues(metadataFields, row.values, customHeaders);
    if (custom.error) return fail(422, `Row ${row.rowNumber}: ${custom.error}`, "VALIDATION_ERROR");
    const metadata = await prepareMetadataValues(context.organizationId, "task", custom.values, existing?.metadata ?? undefined);
    if (!metadata.values) return fail(422, `Row ${row.rowNumber}: ${metadata.error ?? "Custom fields are invalid."}`, "VALIDATION_ERROR");
    const data = {
      title: row.values.title.trim(),
      description: row.values.description?.trim() || existing?.description || null,
      status: workflowStatus.category,
      workflowStatusId: workflowStatus.id,
      priority,
      startDate,
      dueDate,
      estimatedHrs,
      actualHrs,
      requiredDiscipline: row.values.requiredDiscipline?.trim() === "-" ? null : row.values.requiredDiscipline?.trim() || existing?.requiredDiscipline || null,
      milestoneId: milestone ?? null,
      parentTaskId,
      blockedByTaskId,
      assigneeIds: assigneeIds as string[],
      labelIds: labelIds as string[],
      metadata: metadata.values,
    };
    if (!data.title) return fail(422, `Row ${row.rowNumber}: title is required.`, "VALIDATION_ERROR");
    const validated = taskCreateSchema.safeParse({
      ...data,
      description: data.description ?? undefined,
      workflowStatusId: workflowStatus.id,
      metadata: data.metadata,
    });
    if (!validated.success) return fail(422, `Row ${row.rowNumber} is invalid: ${validated.error.issues[0]?.message ?? "Check task details."}`, "VALIDATION_ERROR");
    const requiredValues = { ...data, metadata: metadata.values };
    const missing = missingRequiredTaskFields(workflowStatus.requiredFieldKeys, requiredValues);
    if (missing.length) return fail(422, `Row ${row.rowNumber}: complete required fields: ${requiredTaskFieldLabels(missing, metadataFields).join(", ")}.`, "REQUIRED_FIELDS");
    if (existing && workflowStatus.id !== existing.workflowStatusId) {
      const transitions = project.workflow.transitions.map(({ fromStatusId, toStatusId }) => ({ fromStatusId, toStatusId }));
      if (!isWorkflowTransitionAllowed(existing.workflowStatusId ?? "", workflowStatus.id, transitions)) return fail(422, `Row ${row.rowNumber}: that workflow transition is not allowed.`, "INVALID_TRANSITION");
    }
    rows.push({
      rowNumber: row.rowNumber,
      projectId: project.id,
      projectCode,
      workflowStatusId: workflowStatus.id,
      status: workflowStatus.category,
      taskNumber,
      taskId: existing?.id ?? null,
      action: existing ? "UPDATE" : "CREATE",
      summary: `${projectCode}-${taskNumber ?? "new"} · ${data.title}`,
      data,
      raw: row.values,
    });
  }

  if (mode === "preview") return NextResponse.json({ data: {
    rows: rows.map(({ rowNumber, action, summary }) => ({ rowNumber, action, summary })),
    created: rows.filter(({ action }) => action === "CREATE").length,
    updated: rows.filter(({ action }) => action === "UPDATE").length,
    skipped: 0,
  } });

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    const taskCounters = new Map<string, number>();
    for (const row of rows) {
      const project = await tx.project.findFirst({ where: { id: row.projectId, organizationId: context.organizationId }, select: { taskCounter: true } });
      if (!project) throw new CsvImportError(`Row ${row.rowNumber}: project changed during import.`, 409, "CONFLICT");
      let taskNumber = row.taskNumber;
      if (!row.taskId && taskNumber === null) {
        const next = (taskCounters.get(row.projectId) ?? project.taskCounter) + 1;
        taskCounters.set(row.projectId, next);
        taskNumber = next;
      }
      const before = row.taskId
        ? await tx.task.findFirst({ where: { id: row.taskId, organizationId: context.organizationId }, include: { assignments: { select: { memberId: true } }, labels: { select: { labelId: true } } } })
        : null;
      if (row.taskId && !before) throw new CsvImportError(`Row ${row.rowNumber}: task changed during import.`, 409, "CONFLICT");
      if (taskNumber !== null && !row.taskId) {
        const numberTaken = await tx.task.findFirst({ where: { organizationId: context.organizationId, projectId: row.projectId, taskNumber }, select: { id: true } });
        if (numberTaken) throw new CsvImportError(`Row ${row.rowNumber}: task number is already used in this project.`, 409, "CONFLICT");
      }
      const task = before
        ? await tx.task.update({
            where: { id_organizationId: { id: before.id, organizationId: context.organizationId } },
            data: {
              title: row.data.title,
              ...(row.raw.description !== undefined ? { description: row.data.description } : {}),
              status: row.data.status,
              workflowStatusId: row.workflowStatusId,
              priority: row.data.priority,
              requiredDiscipline: row.data.requiredDiscipline,
              milestoneId: row.data.milestoneId,
              parentTaskId: row.data.parentTaskId,
              blockedByTaskId: row.data.blockedByTaskId,
              ...(row.raw.startDate !== undefined ? { startDate: row.data.startDate } : {}),
              ...(row.raw.dueDate !== undefined ? { dueDate: row.data.dueDate } : {}),
              ...(row.raw.estimatedHrs !== undefined ? { estimatedHrs: row.data.estimatedHrs } : {}),
              ...(row.raw.actualHrs !== undefined ? { actualHrs: row.data.actualHrs } : {}),
              metadata: row.data.metadata,
              completedAt: row.data.status === "COMPLETED" ? before.completedAt ?? new Date() : null,
            },
          })
        : await tx.task.create({
            data: {
              organizationId: context.organizationId,
              projectId: row.projectId,
              taskNumber,
              sortOrder: taskNumber ?? 0,
              title: row.data.title,
              description: row.data.description,
              status: row.data.status,
              workflowStatusId: row.workflowStatusId,
              priority: row.data.priority,
              requiredDiscipline: row.data.requiredDiscipline,
              milestoneId: row.data.milestoneId,
              parentTaskId: row.data.parentTaskId,
              blockedByTaskId: row.data.blockedByTaskId,
              startDate: row.data.startDate,
              dueDate: row.data.dueDate,
              estimatedHrs: row.data.estimatedHrs,
              actualHrs: row.data.actualHrs,
              metadata: row.data.metadata,
              ...(row.data.status === "COMPLETED" ? { completedAt: new Date() } : {}),
            },
          });
      if (!before) {
        await tx.project.update({ where: { id_organizationId: { id: row.projectId, organizationId: context.organizationId } }, data: { taskCounter: Math.max(project.taskCounter, taskNumber ?? 0) } });
        await tx.projectMember.upsert({ where: { projectId_memberId: { projectId: row.projectId, memberId: context.memberId } }, create: { organizationId: context.organizationId, projectId: row.projectId, memberId: context.memberId, role: "MEMBER" }, update: {} });
      }
      await tx.taskAssignment.deleteMany({ where: { taskId: task.id, organizationId: context.organizationId } });
      if (row.data.assigneeIds.length) await tx.taskAssignment.createMany({ data: row.data.assigneeIds.map((memberId) => ({ organizationId: context.organizationId, taskId: task.id, memberId })) });
      await tx.taskLabelAssignment.deleteMany({ where: { taskId: task.id, organizationId: context.organizationId } });
      if (row.data.labelIds.length) await tx.taskLabelAssignment.createMany({ data: row.data.labelIds.map((labelId) => ({ organizationId: context.organizationId, taskId: task.id, labelId })) });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: before ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: "task",
        entityId: task.id,
        before: before ? { title: before.title, status: before.status, priority: before.priority } : null,
        after: { title: task.title, status: task.status, priority: task.priority, workflowStatusId: task.workflowStatusId, labelIds: row.data.labelIds, assigneeIds: row.data.assigneeIds },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      if (before) updated += 1;
      else created += 1;
    }
    return { kind: "complete" as const, created, updated, skipped: 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof CsvImportError) return fail(error.status, error.message, error.code);
    throw error;
  }
  return NextResponse.json({ data: result });
}
