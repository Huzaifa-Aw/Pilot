import { AuditAction, Prisma, TaskStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { prepareMetadataValues } from "@/lib/metadata";
import { wouldCreateTaskDependencyCycle } from "@/lib/task-dependencies";
import { taskUpdateSchema } from "@/lib/validations/task";
import { isWorkflowTransitionAllowed, missingRequiredTaskFields, requiredTaskFieldLabels, resolveWorkflowForProject } from "@/lib/task-workflows";
import { getDefaultMetadataFields } from "@/lib/metadata";

type RouteContext = { params: Promise<{ projectId: string; taskId: string }> };

function taskSnapshot(task: {
  id: string;
  projectId: string;
  workflowStatusId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  estimatedHrs: number | null;
  actualHrs: number;
  startDate: Date | null;
  dueDate: Date | null;
  milestoneId: string | null;
  sortOrder: number;
  completedAt: Date | null;
  metadata: Prisma.JsonValue | null;
  requiredDiscipline: string | null;
  assignments: Array<{ memberId: string }>;
  labels: Array<{ labelId: string }>;
  flaggedAt: Date | null;
  flaggedByMemberId: string | null;
  flagReason: string | null;
}) {
  return {
    id: task.id,
    projectId: task.projectId,
    workflowStatusId: task.workflowStatusId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    estimatedHrs: task.estimatedHrs,
    actualHrs: task.actualHrs,
    startDate: task.startDate?.toISOString().slice(0, 10) ?? null,
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    milestoneId: task.milestoneId,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt?.toISOString() ?? null,
    metadata: task.metadata,
    requiredDiscipline: task.requiredDiscipline,
    assigneeIds: task.assignments.map((assignment) => assignment.memberId),
    labelIds: task.labels.map(({ labelId }) => labelId),
    flaggedAt: task.flaggedAt?.toISOString() ?? null,
    flaggedByMemberId: task.flaggedByMemberId,
    flagReason: task.flagReason,
  };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { projectId, taskId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 400, error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" });
    }
    throw error;
  }
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "Check the task details.", code: "VALIDATION_ERROR" });
  }

  const {
    assigneeIds,
    labelIds,
    flagged,
    flagReason,
    workflowStatusId: requestedWorkflowStatusId,
    status: legacyStatus,
    updatedAt,
    metadata,
    ...taskData
  } = parsed.data;

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.task.findFirst({
      where: { id: taskId, projectId, organizationId: context.organizationId },
      include: {
        assignments: { select: { memberId: true } },
        labels: { select: { labelId: true } },
        project: { select: { workflowId: true } },
      },
    });
    if (!before) return { kind: "missing" as const };

    const isManager = await can(context, "task.update", { projectId });
    const canMove = await can(context, "task.move", {
      projectId,
      taskAssigneeIds: before.assignments.map(({ memberId }) => memberId),
    });
    if (!isManager && !canMove) {
      return { kind: "unassigned" as const };
    }
    if (!isManager && (
      Object.keys(taskData).some((field) => !["actualHrs", "sortOrder"].includes(field)) ||
      assigneeIds !== undefined ||
      labelIds !== undefined
    )) {
      return { kind: "forbidden" as const };
    }
    if (updatedAt && before.updatedAt.toISOString() !== updatedAt) return { kind: "conflict" as const };
    const parentTaskId = Object.hasOwn(taskData, "parentTaskId") ? taskData.parentTaskId : before.parentTaskId;
    const blockedByTaskId = Object.hasOwn(taskData, "blockedByTaskId") ? taskData.blockedByTaskId : before.blockedByTaskId;
    const dependencyIds = [...new Set([parentTaskId, blockedByTaskId].filter((id): id is string => Boolean(id)))];
    if (dependencyIds.length) {
      const dependencies = await tx.task.findMany({
        where: { projectId, organizationId: context.organizationId },
        select: { id: true, parentTaskId: true, blockedByTaskId: true },
      });
      if (dependencyIds.some((id) => !dependencies.some((dependency) => dependency.id === id))) return { kind: "dependency" as const };
      if (parentTaskId && wouldCreateTaskDependencyCycle(taskId, parentTaskId, dependencies.map(({ id, parentTaskId }) => ({ id, dependencyId: parentTaskId })))) return { kind: "cycle" as const };
      if (blockedByTaskId && wouldCreateTaskDependencyCycle(taskId, blockedByTaskId, dependencies.map(({ id, blockedByTaskId }) => ({ id, dependencyId: blockedByTaskId })))) return { kind: "cycle" as const };
    }
    const metadataResult = metadata !== undefined
      ? await prepareMetadataValues(context.organizationId, "task", metadata, before.metadata, tx)
      : null;
    if (metadataResult?.error) return { kind: "metadata" as const, message: metadataResult.error };

    let workflowStatus = null;
    if (requestedWorkflowStatusId || legacyStatus) {
      const workflow = await resolveWorkflowForProject(tx, context.organizationId, before.project.workflowId);
      if (!workflow) return { kind: "workflow" as const };
      workflowStatus = requestedWorkflowStatusId
        ? workflow.statuses.find(({ id }) => id === requestedWorkflowStatusId) ?? null
        : workflow.statuses.find(({ category }) => category === legacyStatus) ?? null;
      if (!workflowStatus) return { kind: "workflow-status" as const };
      const currentWorkflowStatusId = before.workflowStatusId
        ?? workflow.statuses.find(({ category }) => category === before.status)?.id
        ?? null;
      if (workflowStatus.id !== currentWorkflowStatusId) {
        const transitions = await tx.taskWorkflowTransition.findMany({
          where: { organizationId: context.organizationId, workflowId: workflow.id },
          select: { fromStatusId: true, toStatusId: true },
        });
        if (!currentWorkflowStatusId || !isWorkflowTransitionAllowed(currentWorkflowStatusId, workflowStatus.id, transitions)) {
          return { kind: "transition" as const };
        }
        const requiredValues = {
          title: taskData.title ?? before.title,
          description: taskData.description ?? before.description,
          status: workflowStatus.category,
          priority: taskData.priority ?? before.priority,
          assigneeIds: assigneeIds ?? before.assignments.map(({ memberId }) => memberId),
          labelIds: labelIds ?? before.labels.map(({ labelId }) => labelId),
          estimatedHrs: taskData.estimatedHrs ?? before.estimatedHrs,
          actualHrs: taskData.actualHrs ?? before.actualHrs,
          startDate: taskData.startDate ?? before.startDate,
          dueDate: taskData.dueDate ?? before.dueDate,
          milestoneId: Object.hasOwn(taskData, "milestoneId") ? taskData.milestoneId : before.milestoneId,
          requiredDiscipline: Object.hasOwn(taskData, "requiredDiscipline") ? taskData.requiredDiscipline : before.requiredDiscipline,
          ...(metadataResult?.values ?? (before.metadata as Record<string, unknown> | null) ?? {}),
        };
        const missingFields = missingRequiredTaskFields(workflowStatus.requiredFieldKeys, requiredValues);
        if (missingFields.length) {
          const customFields = await getDefaultMetadataFields(context.organizationId, "task", tx);
          return { kind: "required-fields" as const, fields: requiredTaskFieldLabels(missingFields, customFields) };
        }
      }
    }

    let uniqueAssigneeIds: string[] | undefined;
    if (assigneeIds !== undefined) {
      uniqueAssigneeIds = [...new Set(assigneeIds)];
      const members = await tx.organizationMember.findMany({
        where: {
          id: { in: uniqueAssigneeIds },
          organizationId: context.organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (members.length !== uniqueAssigneeIds.length) return { kind: "assignee" as const };
    }
    let uniqueLabelIds: string[] | undefined;
    if (labelIds !== undefined) {
      uniqueLabelIds = [...new Set(labelIds)];
      const labels = await tx.taskLabel.findMany({
        where: { id: { in: uniqueLabelIds }, organizationId: context.organizationId },
        select: { id: true },
      });
      if (labels.length !== uniqueLabelIds.length) return { kind: "label" as const };
    }

    const update = await tx.task.updateMany({
      where: { id: taskId, organizationId: context.organizationId, updatedAt: before.updatedAt },
      data: {
        ...taskData,
        ...(workflowStatus ? {
          workflowStatusId: workflowStatus.id,
          status: workflowStatus.category,
          completedAt: workflowStatus.category === "COMPLETED"
            ? before.completedAt ?? new Date()
            : null,
        } : {}),
        ...(legacyStatus && !workflowStatus ? { status: legacyStatus } : {}),
        ...(flagged !== undefined ? {
          flaggedAt: flagged ? before.flaggedAt ?? new Date() : null,
          flaggedByMemberId: flagged ? context.memberId : null,
          flagReason: flagged ? flagReason ?? before.flagReason : null,
        } : flagReason !== undefined ? { flagReason } : {}),
        ...(metadataResult ? { metadata: metadataResult.values } : {}),
      },
    });
    if (update.count !== 1) return { kind: "conflict" as const };
    if (uniqueAssigneeIds !== undefined) {
      await tx.taskAssignment.deleteMany({ where: { taskId, organizationId: context.organizationId } });
      if (uniqueAssigneeIds.length) {
        await tx.taskAssignment.createMany({
          data: uniqueAssigneeIds.map((memberId) => ({ taskId, memberId, organizationId: context.organizationId })),
        });
      }
    }
    if (uniqueLabelIds !== undefined) {
      await tx.taskLabelAssignment.deleteMany({ where: { taskId, organizationId: context.organizationId } });
      if (uniqueLabelIds.length) {
        await tx.taskLabelAssignment.createMany({
          data: uniqueLabelIds.map((labelId) => ({ taskId, labelId, organizationId: context.organizationId })),
        });
      }
    }
    const updated = await tx.task.findFirstOrThrow({
      where: { id: taskId, projectId, organizationId: context.organizationId },
      include: {
        assignments: { select: { memberId: true } },
        labels: { select: { labelId: true } },
      },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "task",
      entityId: taskId,
      before: taskSnapshot(before),
      after: taskSnapshot(updated),
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, task: updated };
    });
  } catch (error) {
    throw error;
  }

  if (result.kind === "missing") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 404, error: "Task not found.", code: "NOT_FOUND" });
  }
  if (result.kind === "unassigned") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 403, error: "You can update only tasks assigned to you.", code: "FORBIDDEN" });
  }
  if (result.kind === "forbidden") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 403, error: "You can only change status or actual hours on tasks assigned to you.", code: "FORBIDDEN" });
  }
  if (result.kind === "conflict") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 409, error: "This task changed since you opened it. Refresh and try again.", code: "CONFLICT" });
  }
  if (result.kind === "dependency") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "Choose a parent and blocker from this project.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "cycle") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "That task dependency would create a cycle.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "metadata") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: result.message, code: "VALIDATION_ERROR" });
  }
  if (result.kind === "assignee") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "One or more assignees are not active members of this organization.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "label") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "Choose labels available to this organization.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "workflow" || result.kind === "workflow-status") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "Choose an active status in this project's workflow.", code: "VALIDATION_ERROR" });
  }
  if (result.kind === "transition") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: "That status change is not allowed by the project's workflow.", code: "INVALID_TRANSITION" });
  }
  if (result.kind === "required-fields") {
    return auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task", entityId: taskId, status: 422, error: `Complete the required fields: ${result.fields.join(", ")}.`, code: "REQUIRED_FIELDS" });
  }
  return NextResponse.json({ data: result.task });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId, taskId } = await params;

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.task.findFirst({
      where: { id: taskId, projectId, organizationId: context.organizationId },
      include: { assignments: { select: { memberId: true } }, labels: { select: { labelId: true } } },
    });
    if (!before) return { kind: "missing" as const };
    if (!(await can(context, "task.update", { projectId }))) return { forbidden: true as const };
    const [worklogs, children, blockedTasks] = await Promise.all([
      tx.worklog.count({ where: { organizationId: context.organizationId, taskId } }),
      tx.task.count({ where: { organizationId: context.organizationId, parentTaskId: taskId } }),
      tx.task.count({ where: { organizationId: context.organizationId, blockedByTaskId: taskId } }),
    ]);
    if (worklogs || children || blockedTasks) return { kind: "has-dependencies" as const, worklogs, children, blockedTasks };
    const deleted = await tx.task.delete({
      where: { id_organizationId: { id: taskId, organizationId: context.organizationId } },
      include: { assignments: { select: { memberId: true } } },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "task",
      entityId: taskId,
      before: taskSnapshot(before),
      after: null,
    }, tx);
    return { kind: "deleted" as const, task: deleted };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      return auditUserFailureResponse({ request, context, action: AuditAction.DELETE, entityType: "task", entityId: taskId, status: 409, error: "Move dependent worklogs or child tasks before deleting this task.", code: "HAS_DEPENDENCIES" });
    }
    throw error;
  }
  if (result.kind === "missing") {
    return auditUserFailureResponse({ request, context, action: AuditAction.DELETE, entityType: "task", entityId: taskId, status: 404, error: "Task not found.", code: "NOT_FOUND" });
  }
  if ("forbidden" in result) {
    return auditUserFailureResponse({ request, context, action: AuditAction.DELETE, entityType: "task", entityId: taskId, status: 403, error: "You need project access to delete this task.", code: "FORBIDDEN" });
  }
  if (result.kind === "has-dependencies") return auditUserFailureResponse({ request, context, action: AuditAction.DELETE, entityType: "task", entityId: taskId, status: 409, error: "Move worklogs, child tasks, and dependent tasks before deleting this task.", code: "HAS_DEPENDENCIES" });
  return NextResponse.json({ data: { id: taskId } });
}
