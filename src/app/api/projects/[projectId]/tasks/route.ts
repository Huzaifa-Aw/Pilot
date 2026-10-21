import { AuditAction, TaskPriority, TaskStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { prepareMetadataValues } from "@/lib/metadata";
import { idSchema } from "@/lib/validations/shared";
import { taskCreateSchema } from "@/lib/validations/task";

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
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the task details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { assigneeIds = [], metadata: submittedMetadata, ...taskData } = parsed.data;
  const uniqueAssigneeIds = [...new Set(assigneeIds)];
  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organizationId: context.organizationId },
      select: { id: true, taskCounter: true },
    });
    if (!project) return { kind: "project" as const };
    if (!(await can(context, "task.create", { projectId }))) return { kind: "forbidden" as const };
    const metadataResult = await prepareMetadataValues(context.organizationId, "task", submittedMetadata ?? {}, undefined, tx);
    if (metadataResult.error) return { kind: "metadata" as const, message: metadataResult.error };

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
        metadata: metadataResult.values,
        ...(taskData.status === "COMPLETED" ? { completedAt: new Date() } : {}),
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
    const taskWithAssignments = await tx.task.findFirstOrThrow({
      where: { id: task.id, organizationId: context.organizationId },
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
        priority: task.priority,
        assigneeIds: uniqueAssigneeIds,
      },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "created" as const, task: withDisciplineWarnings(taskWithAssignments) };
  });

  if (result.kind === "project") {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "milestone") {
    return NextResponse.json({ error: "Choose a milestone in this project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "dependency") {
    return NextResponse.json({ error: "Choose parent and blocking tasks from this project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "assignee") {
    return NextResponse.json({ error: "One or more assignees are not active members of this organization.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "forbidden") {
    return NextResponse.json({ error: "Join this project before creating tasks.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "metadata") {
    return NextResponse.json({ error: result.message, code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
  }
  return NextResponse.json({ data: result.task }, { status: 201 });
}
