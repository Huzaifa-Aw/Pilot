import { AuditAction, Prisma, TaskStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { prepareMetadataValues } from "@/lib/metadata";
import { wouldCreateTaskDependencyCycle } from "@/lib/task-dependencies";
import { taskUpdateSchema } from "@/lib/validations/task";

type RouteContext = { params: Promise<{ projectId: string; taskId: string }> };

function taskSnapshot(task: {
  id: string;
  projectId: string;
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
}) {
  return {
    id: task.id,
    projectId: task.projectId,
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
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the task details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { assigneeIds, updatedAt, metadata, ...taskData } = parsed.data;

  const result = await db.$transaction(async (tx) => {
    const before = await tx.task.findFirst({
      where: { id: taskId, projectId, organizationId: context.organizationId },
      include: { assignments: { select: { memberId: true } } },
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
    if (!isManager && (Object.keys(taskData).some((field) => !["status", "actualHrs", "sortOrder"].includes(field)) || assigneeIds !== undefined)) {
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

    const update = await tx.task.updateMany({
      where: { id: taskId, organizationId: context.organizationId, updatedAt: before.updatedAt },
      data: {
        ...taskData,
        ...(taskData.status !== undefined ? {
          completedAt: taskData.status === "COMPLETED"
            ? before.completedAt ?? new Date()
            : null,
        } : {}),
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
    const updated = await tx.task.findFirstOrThrow({
      where: { id: taskId, projectId, organizationId: context.organizationId },
      include: { assignments: { select: { memberId: true } } },
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

  if (result.kind === "missing") {
    return NextResponse.json({ error: "Task not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "unassigned") {
    return NextResponse.json({ error: "You can update only tasks assigned to you.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "forbidden") {
    return NextResponse.json({ error: "You can only change status or actual hours on tasks assigned to you.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "conflict") {
    return NextResponse.json({ error: "This task changed since you opened it. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
  }
  if (result.kind === "dependency") {
    return NextResponse.json({ error: "Choose a parent and blocker from this project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "cycle") {
    return NextResponse.json({ error: "That task dependency would create a cycle.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "metadata") {
    return NextResponse.json({ error: result.message, code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
  }
  if (result.kind === "assignee") {
    return NextResponse.json({ error: "One or more assignees are not active members of this organization.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  return NextResponse.json({ data: result.task });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId, taskId } = await params;

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.task.findFirst({
      where: { id: taskId, projectId, organizationId: context.organizationId },
      include: { assignments: { select: { memberId: true } } },
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
      return NextResponse.json({ error: "Move dependent worklogs or child tasks before deleting this task.", code: "HAS_DEPENDENCIES" }, { status: 409 });
    }
    throw error;
  }
  if (result.kind === "missing") {
    return NextResponse.json({ error: "Task not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if ("forbidden" in result) {
    return NextResponse.json({ error: "You need project access to delete this task.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "has-dependencies") return NextResponse.json({ error: "Move worklogs, child tasks, and dependent tasks before deleting this task.", code: "HAS_DEPENDENCIES" }, { status: 409 });
  return NextResponse.json({ data: { id: taskId } });
}
