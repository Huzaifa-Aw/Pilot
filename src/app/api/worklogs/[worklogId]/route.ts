import { AuditAction, Prisma, TimesheetPeriodStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isTransactionConflict, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { worklogUpdateSchema } from "@/lib/validations/worklog";

type RouteContext = { params: Promise<{ worklogId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = worklogUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the time entry details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const { worklogId } = await params;

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.worklog.findFirst({
      where: { id: worklogId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };
    if (before.memberId !== context.memberId && !roleAtLeast(context.role, "ADMIN")) return { kind: "forbidden" as const };
    const date = parsed.data.date ?? before.date;
    if (date.getUTCMonth() !== before.date.getUTCMonth() || date.getUTCFullYear() !== before.date.getUTCFullYear()) {
      return { kind: "month-change" as const };
    }
    if (date > new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")) return { kind: "future-date" as const };
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const period = await tx.timesheetPeriod.findUnique({
      where: { organizationId_memberId_monthStart: { organizationId: context.organizationId, memberId: before.memberId, monthStart } },
    });
    if (period?.status === TimesheetPeriodStatus.SUBMITTED || period?.status === TimesheetPeriodStatus.APPROVED) return { kind: "locked" as const };

    let projectId = Object.hasOwn(parsed.data, "projectId") ? parsed.data.projectId ?? null : before.projectId;
    const taskId = Object.hasOwn(parsed.data, "taskId") ? parsed.data.taskId ?? null : before.taskId;
    if (taskId) {
      const task = await tx.task.findFirst({
        where: { id: taskId, organizationId: context.organizationId },
        select: { projectId: true },
      });
      if (!task || (projectId && projectId !== task.projectId)) return { kind: "task" as const };
      projectId = task.projectId;
    }
    if (projectId) {
      const project = await tx.project.findFirst({
        where: { id: projectId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!project) return { kind: "project" as const };
      if (!(await can(context, "project.read", { projectId }))) return { kind: "forbidden-project" as const };
    }
    if (!projectId && !parsed.data.category && !before.category) return { kind: "category" as const };
    const total = await tx.worklog.aggregate({
      where: { organizationId: context.organizationId, memberId: before.memberId, date, id: { not: worklogId } },
      _sum: { hours: true },
    });
    if ((total._sum.hours ?? 0) + (parsed.data.hours ?? before.hours) > 24) return { kind: "daily-limit" as const };

    const updated = await tx.worklog.update({
      where: { id: worklogId, organizationId: context.organizationId },
      data: { ...parsed.data, projectId, taskId },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "worklog",
      entityId: worklogId,
      before: { memberId: before.memberId, projectId: before.projectId, taskId: before.taskId, date: before.date.toISOString().slice(0, 10), hours: before.hours },
      after: { memberId: updated.memberId, projectId: updated.projectId, taskId: updated.taskId, date: updated.date.toISOString().slice(0, 10), hours: updated.hours },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isTransactionConflict(error)) return NextResponse.json({ error: "Time entries changed concurrently. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
    throw error;
  }

  if (result.kind === "missing") return NextResponse.json({ error: "Time entry not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "forbidden") return NextResponse.json({ error: "You can edit only your own time entries.", code: "FORBIDDEN" }, { status: 403 });
  if (result.kind === "forbidden-project") return NextResponse.json({ error: "You must be a member of the selected project to log time against it.", code: "FORBIDDEN" }, { status: 403 });
  if (result.kind === "project") return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "month-change") return NextResponse.json({ error: "Move this entry by deleting it and logging it in the other month.", code: "VALIDATION_ERROR" }, { status: 422 });
  if (result.kind === "future-date") return NextResponse.json({ error: "Time can only be logged for today or an earlier date.", code: "VALIDATION_ERROR" }, { status: 422 });
  if (result.kind === "locked") return NextResponse.json({ error: "This submitted or approved month is locked.", code: "TIMESHEET_LOCKED" }, { status: 409 });
  if (result.kind === "task") return NextResponse.json({ error: "Choose a task in the selected project.", code: "VALIDATION_ERROR" }, { status: 422 });
  if (result.kind === "category") return NextResponse.json({ error: "Choose a project or non-project category.", code: "VALIDATION_ERROR" }, { status: 422 });
  if (result.kind === "daily-limit") return NextResponse.json({ error: "Daily time cannot exceed 24 hours.", code: "DAILY_LIMIT" }, { status: 422 });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { worklogId } = await params;
  const result = await db.$transaction(async (tx) => {
    const before = await tx.worklog.findFirst({
      where: { id: worklogId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };
    if (before.memberId !== context.memberId && !roleAtLeast(context.role, "ADMIN")) return { kind: "forbidden" as const };
    const monthStart = new Date(Date.UTC(before.date.getUTCFullYear(), before.date.getUTCMonth(), 1));
    const period = await tx.timesheetPeriod.findUnique({
      where: { organizationId_memberId_monthStart: { organizationId: context.organizationId, memberId: before.memberId, monthStart } },
    });
    if (period?.status === TimesheetPeriodStatus.SUBMITTED || period?.status === TimesheetPeriodStatus.APPROVED) return { kind: "locked" as const };
    await tx.worklog.delete({ where: { id: worklogId, organizationId: context.organizationId } });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "worklog",
      entityId: worklogId,
      before: { memberId: before.memberId, projectId: before.projectId, taskId: before.taskId, date: before.date.toISOString().slice(0, 10), hours: before.hours },
      after: null,
    }, tx);
    return { kind: "deleted" as const };
  });
  if (result.kind === "missing") return NextResponse.json({ error: "Time entry not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "forbidden") return NextResponse.json({ error: "You can delete only your own time entries.", code: "FORBIDDEN" }, { status: 403 });
  if (result.kind === "locked") return NextResponse.json({ error: "This submitted or approved month is locked.", code: "TIMESHEET_LOCKED" }, { status: 409 });
  return NextResponse.json({ data: { id: worklogId } });
}
