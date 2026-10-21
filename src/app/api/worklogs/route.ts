import { AuditAction, Prisma, TimesheetPeriodStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isTransactionConflict, requireTenantRole } from "@/lib/api";
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
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = worklogCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the time entry details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const memberId = parsed.data.memberId ?? context.memberId;
  if (memberId !== context.memberId && !roleAtLeast(context.role, "ADMIN")) {
    return NextResponse.json({ error: "Only an administrator can log time for another person.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (memberId === context.memberId && !(await can(context, "timesheet.log"))) {
    return NextResponse.json({ error: "Your role cannot log time.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (parsed.data.date > new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")) {
    return NextResponse.json({ error: "Time can only be logged for today or an earlier date.", code: "VALIDATION_ERROR" }, { status: 422 });
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
      return NextResponse.json({ error: "Time entries changed concurrently. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }

  if (result.kind === "member") return NextResponse.json({ error: "Active member not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "task") return NextResponse.json({ error: "Choose a task in the selected project.", code: "VALIDATION_ERROR" }, { status: 422 });
  if (result.kind === "project") return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "forbidden") return NextResponse.json({ error: "You must be a member of this project to log time against it.", code: "FORBIDDEN" }, { status: 403 });
  if (result.kind === "locked") return NextResponse.json({ error: "This submitted or approved month is locked.", code: "TIMESHEET_LOCKED" }, { status: 409 });
  if (result.kind === "daily-limit") return NextResponse.json({ error: "Daily time cannot exceed 24 hours.", code: "DAILY_LIMIT" }, { status: 422 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
