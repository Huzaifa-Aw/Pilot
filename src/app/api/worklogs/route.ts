import { AuditAction, Prisma, TimesheetPeriodStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isTransactionConflict, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { idSchema } from "@/lib/validations/shared";
import { worklogCreateSchema } from "@/lib/validations/worklog";

function validMonth(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const monthStart = validMonth(params.get("month"));
  if (!monthStart) {
    return NextResponse.json({ error: "Choose a month in YYYY-MM format.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const memberId = params.get("memberId") ?? context.memberId;
  if (!idSchema.safeParse(memberId).success) {
    return NextResponse.json({ error: "Choose a valid team member.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (memberId !== context.memberId && !(await can(context, "timesheet.team", { memberId }))) {
    return NextResponse.json({ error: "You can view only your own worklogs or your team's worklogs.", code: "FORBIDDEN" }, { status: 403 });
  }
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const [worklogs, period] = await Promise.all([
    db.worklog.findMany({
      where: {
        organizationId: context.organizationId,
        memberId,
        date: { gte: monthStart, lt: nextMonth },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        project: { select: { id: true, code: true, title: true } },
        task: { select: { id: true, title: true, taskNumber: true } },
      },
    }),
    db.timesheetPeriod.findUnique({
      where: { organizationId_memberId_monthStart: { organizationId: context.organizationId, memberId, monthStart } },
    }),
  ]);
  return NextResponse.json({ data: worklogs, period });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.CREATE, entityType: "worklog", status, error, code,
  });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    }
    throw error;
  }
  const parsed = worklogCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the time entry details.", "VALIDATION_ERROR");
  }
  const memberId = parsed.data.memberId ?? context.memberId;
  if (memberId !== context.memberId && !roleAtLeast(context.role, "ADMIN")) {
    return fail(403, "Only an administrator can log time for another person.", "FORBIDDEN");
  }
  if (memberId === context.memberId && !(await can(context, "timesheet.log"))) {
    return fail(403, "Your role cannot log time.", "FORBIDDEN");
  }
  if (parsed.data.date > new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")) {
    return fail(422, "Time can only be logged for today or an earlier date.", "VALIDATION_ERROR");
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const member = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId: context.organizationId, isActive: true },
      select: { id: true },
    });
    if (!member) return { kind: "member" as const };

    let projectId = parsed.data.projectId ?? null;
    if (parsed.data.taskId) {
      const task = await tx.task.findFirst({
        where: { id: parsed.data.taskId, organizationId: context.organizationId },
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
      if (!(await can(context, "project.read", { projectId }))) return { kind: "forbidden" as const };
    }

    const monthStart = new Date(Date.UTC(parsed.data.date.getUTCFullYear(), parsed.data.date.getUTCMonth(), 1));
    const period = await tx.timesheetPeriod.findUnique({
      where: { organizationId_memberId_monthStart: { organizationId: context.organizationId, memberId, monthStart } },
    });
    if (period?.status === TimesheetPeriodStatus.SUBMITTED || period?.status === TimesheetPeriodStatus.APPROVED) {
      return { kind: "locked" as const };
    }

    const dailyTotal = await tx.worklog.aggregate({
      where: { organizationId: context.organizationId, memberId, date: parsed.data.date },
      _sum: { hours: true },
    });
    if ((dailyTotal._sum.hours ?? 0) + parsed.data.hours > 24) return { kind: "daily-limit" as const };

    const worklog = await tx.worklog.create({
      data: {
        ...parsed.data,
        memberId,
        projectId,
        taskId: parsed.data.taskId ?? null,
        description: parsed.data.description || null,
        category: parsed.data.category || null,
        organizationId: context.organizationId,
      },
      include: { project: { select: { code: true, title: true } }, task: { select: { title: true, taskNumber: true } } },
    });
    if (!period) {
      await tx.timesheetPeriod.create({
        data: { organizationId: context.organizationId, memberId, monthStart },
      });
    }
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.CREATE,
      entityType: "worklog",
      entityId: worklog.id,
      after: {
        id: worklog.id,
        memberId,
        projectId,
        taskId: worklog.taskId,
        date: worklog.date.toISOString().slice(0, 10),
        hours: worklog.hours,
      },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "created" as const, data: worklog };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isTransactionConflict(error)) {
      return fail(409, "Time entries changed concurrently. Refresh and try again.", "CONFLICT");
    }
    throw error;
  }

  if (result.kind === "member") return fail(404, "Active member not found.", "NOT_FOUND");
  if (result.kind === "task") return fail(422, "Choose a task in the selected project.", "VALIDATION_ERROR");
  if (result.kind === "project") return fail(404, "Project not found.", "NOT_FOUND");
  if (result.kind === "forbidden") return fail(403, "You must be a member of this project to log time against it.", "FORBIDDEN");
  if (result.kind === "locked") return fail(409, "This submitted or approved month is locked.", "TIMESHEET_LOCKED");
  if (result.kind === "daily-limit") return fail(422, "Daily time cannot exceed 24 hours.", "DAILY_LIMIT");
  return NextResponse.json({ data: result.data }, { status: 201 });
}
