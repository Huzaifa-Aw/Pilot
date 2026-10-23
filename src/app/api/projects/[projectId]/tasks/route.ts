import { AuditAction, TaskPriority, TaskStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getDefaultMetadataFields, prepareMetadataValues } from "@/lib/metadata";
import { idSchema } from "@/lib/validations/shared";
import { taskCreateSchema } from "@/lib/validations/task";
import { missingRequiredTaskFields, requiredTaskFieldLabels, resolveWorkflowForProject } from "@/lib/task-workflows";

type RouteContext = { params: Promise<{ projectId: string }> };

function isTaskStatus(value: string): value is TaskStatus {
  return Object.values(TaskStatus).some((item) => item === value);
}

function isTaskPriority(value: string): value is TaskPriority {
  return Object.values(TaskPriority).some((item) => item === value);
}

function withDisciplineWarnings<T extends {
  requiredDiscipline: string | null;
  assignments: Array<{ member: { discipline: string | null } }>;
}>(task: T) {
  return {
    ...task,
    assignments: task.assignments.map((assignment) => ({
      ...assignment,
      disciplineWarning: Boolean(
        task.requiredDiscipline &&
        task.requiredDiscipline.trim().toLowerCase() !== (assignment.member.discipline ?? "").trim().toLowerCase(),
      ),
    })),
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { projectId } = await params;

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await can(context, "project.read", { projectId }))) {
    return NextResponse.json({ error: "You don't have access to this project.", code: "FORBIDDEN" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  let statusFilter: TaskStatus | undefined;
  let priorityFilter: TaskPriority | undefined;
  if (status) {
    if (!isTaskStatus(status)) {
      return NextResponse.json({ error: "Choose a valid task status.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    statusFilter = status;
  }
  if (priority) {
    if (!isTaskPriority(priority)) {
      return NextResponse.json({ error: "Choose a valid task priority.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    priorityFilter = priority;
  }
  const milestoneId = searchParams.get("milestoneId");
  const assignedTo = searchParams.get("assignedTo");
  if ((milestoneId && !idSchema.safeParse(milestoneId).success) || (assignedTo && !idSchema.safeParse(assignedTo).success)) {
    return NextResponse.json({ error: "Choose a valid member or milestone.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const tasks = await db.task.findMany({
    where: {
      projectId,
      organizationId: context.organizationId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(milestoneId ? { milestoneId } : {}),
      ...(assignedTo
        ? { assignments: { some: { memberId: assignedTo } } }
        : {}),
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
    include: {
      assignments: {
        include: {
          member: {
            select: {
              id: true,
              discipline: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: tasks.map((task) => withDisciplineWarnings(task)) });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { projectId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 400, error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" });
    }
    throw error;
  }
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: "Check the task details.", code: "VALIDATION_ERROR" });
  }

  const {
    assigneeIds = [],
    metadata: submittedMetadata,
    workflowStatusId: requestedWorkflowStatusId,
    labelIds = [],
    flagged,
    flagReason,
    status: legacyStatus,
    ...taskData
  } = parsed.data;
  const uniqueAssigneeIds = [...new Set(assigneeIds)];
  const uniqueLabelIds = [...new Set(labelIds)];
  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organizationId: context.organizationId },
      select: { id: true, taskCounter: true, workflowId: true },
    });
    if (!project) return { kind: "project" as const };
    if (!(await can(context, "task.create", { projectId }))) return { kind: "forbidden" as const };
    const metadataResult = await prepareMetadataValues(context.organizationId, "task", submittedMetadata ?? {}, undefined, tx);
    if (metadataResult.error) return { kind: "metadata" as const, message: metadataResult.error };
    const workflow = await resolveWorkflowForProject(tx, context.organizationId, project.workflowId);
    if (!workflow) return { kind: "workflow" as const };
    const workflowStatus = requestedWorkflowStatusId
      ? workflow.statuses.find(({ id }) => id === requestedWorkflowStatusId)
      : legacyStatus
        ? workflow.statuses.find(({ category }) => category === legacyStatus)
        : workflow.statuses.find(({ isInitial }) => isInitial);
    if (!workflowStatus) return { kind: "workflow-status" as const };
    const missingFields = missingRequiredTaskFields(
      workflowStatus.requiredFieldKeys,
      { ...taskData, assigneeIds: uniqueAssigneeIds, labelIds: uniqueLabelIds, ...metadataResult.values },
    );
    if (missingFields.length) {
      const customFields = await getDefaultMetadataFields(context.organizationId, "task", tx);
      return { kind: "required-fields" as const, fields: requiredTaskFieldLabels(missingFields, customFields) };
    }

    if (taskData.milestoneId) {
      const milestone = await tx.milestone.findFirst({
        where: { id: taskData.milestoneId, projectId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!milestone) return { kind: "milestone" as const };
    }
    const dependencyIds = [...new Set([taskData.parentTaskId, taskData.blockedByTaskId].filter((id): id is string => Boolean(id)))];
    if (dependencyIds.length) {
      const dependencies = await tx.task.findMany({
        where: { id: { in: dependencyIds }, projectId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (dependencies.length !== dependencyIds.length) return { kind: "dependency" as const };
    }

    const members = uniqueAssigneeIds.length
      ? await tx.organizationMember.findMany({
          where: {
            id: { in: uniqueAssigneeIds },
            organizationId: context.organizationId,
            isActive: true,
          },
          select: { id: true },
        })
      : [];
    if (members.length !== uniqueAssigneeIds.length) return { kind: "assignee" as const };
    const labels = uniqueLabelIds.length
      ? await tx.taskLabel.findMany({
          where: { id: { in: uniqueLabelIds }, organizationId: context.organizationId },
          select: { id: true },
        })
      : [];
    if (labels.length !== uniqueLabelIds.length) return { kind: "label" as const };

    const nextProject = await tx.project.update({
      where: { id_organizationId: { id: projectId, organizationId: context.organizationId } },
      data: { taskCounter: { increment: 1 } },
      select: { taskCounter: true },
    });
    const task = await tx.task.create({
      data: {
        ...taskData,
        projectId,
        organizationId: context.organizationId,
        taskNumber: nextProject.taskCounter,
        sortOrder: nextProject.taskCounter,
        status: workflowStatus.category,
        workflowStatusId: workflowStatus.id,
        metadata: metadataResult.values,
        ...(workflowStatus.category === "COMPLETED" ? { completedAt: new Date() } : {}),
        ...(flagged ? {
          flaggedAt: new Date(),
          flaggedByMemberId: context.memberId,
          flagReason: flagReason ?? null,
        } : {}),
      },
    });
    if (uniqueAssigneeIds.length) {
      await tx.taskAssignment.createMany({
        data: uniqueAssigneeIds.map((memberId) => ({
          taskId: task.id,
          memberId,
          organizationId: context.organizationId,
        })),
      });
    }
    if (uniqueLabelIds.length) {
      await tx.taskLabelAssignment.createMany({
        data: uniqueLabelIds.map((labelId) => ({ taskId: task.id, labelId, organizationId: context.organizationId })),
      });
    }
    const taskWithAssignments = await tx.task.findFirstOrThrow({
      where: { id: task.id, organizationId: context.organizationId },
      include: {
        workflowStatus: { select: { id: true, name: true, category: true, sortOrder: true } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        assignments: {
          include: {
            member: {
              select: {
                id: true,
                discipline: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.CREATE,
      entityType: "task",
      entityId: task.id,
      after: {
        id: task.id,
        projectId,
        title: task.title,
        status: task.status,
        workflowStatusId: workflowStatus.id,
        priority: task.priority,
        assigneeIds: uniqueAssigneeIds,
        labelIds: uniqueLabelIds,
        flagged: Boolean(flagged),
      },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "created" as const, task: withDisciplineWarnings(taskWithAssignments) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 409, error: "A task with that number already exists in this project.", code: "CONFLICT" });
    }
    throw error;
  }

  if (result.kind === "project") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 404, error: "Project not found.", code: "NOT_FOUND" });
  }
  if (result.kind === "milestone") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: "Choose a milestone in this project.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "dependency") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: "Choose parent and blocking tasks from this project.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "assignee") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: "One or more assignees are not active members of this organization.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "forbidden") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 403, error: "Join this project before creating tasks.", code: "FORBIDDEN" });
  }
  if (result.kind === "metadata") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: result.message, code: "VALIDATION_ERROR" });
  }
  if (result.kind === "workflow" || result.kind === "workflow-status") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: "Choose an active status in this project's workflow.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "required-fields") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: `Complete the required fields: ${result.fields.join(", ")}.`, code: "REQUIRED_FIELDS" });
  }
  if (result.kind === "label") {
    return auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task", status: 422, error: "Choose labels available to this organization.", code: "VALIDATION_ERROR" });
  }
  return NextResponse.json({ data: result.task }, { status: 201 });
}
