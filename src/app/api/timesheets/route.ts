import { AuditAction, Prisma, TimesheetStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can, reportTree } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { timesheetCreateSchema } from "@/lib/validations/timesheet";

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const weekStartValue = params.get("weekStart");
  const weekEndValue = params.get("weekEnd");
  const memberId = params.get("memberId");
  const status = params.get("status");
  if (status && !Object.values(TimesheetStatus).some((value) => value === status)) {
    return NextResponse.json({ error: "Choose a valid timesheet status.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const weekStart = weekStartValue ? new Date(weekStartValue) : null;
  const weekEnd = weekEndValue ? new Date(weekEndValue) : null;
  if (
    (weekStartValue && (Number.isNaN(weekStart?.getTime()) || weekStart?.getUTCDay() !== 1)) ||
    (weekEndValue && (Number.isNaN(weekEnd?.getTime()) || weekEnd?.getUTCDay() !== 1))
  ) {
    return NextResponse.json({ error: "Week filters must be Mondays in ISO date format.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (memberId && !roleAtLeast(context.role, "MANAGER")) {
    return NextResponse.json({ error: "Only managers can filter another member's timesheets.", code: "FORBIDDEN" }, { status: 403 });
  }
  const scopedMemberIds = roleAtLeast(context.role, "ADMIN")
    ? undefined
    : roleAtLeast(context.role, "MANAGER")
      ? await reportTree(context)
      : [context.memberId];
  if (memberId && scopedMemberIds && !scopedMemberIds.includes(memberId)) {
    return NextResponse.json({ error: "You can access only your team's timesheets.", code: "FORBIDDEN" }, { status: 403 });
  }

  const where: Prisma.TimesheetEntryWhereInput = {
    organizationId: context.organizationId,
    ...(scopedMemberIds ? { memberId: { in: scopedMemberIds } } : {}),
    ...(memberId ? { memberId } : {}),
    ...(status ? { status: status as TimesheetStatus } : {}),
    ...(weekStart || weekEnd ? {
      weekStartDate: {
        ...(weekStart ? { gte: weekStart } : {}),
        ...(weekEnd ? { lte: weekEnd } : {}),
      },
    } : {}),
  };

  const entries = await db.timesheetEntry.findMany({
    where,
    include: {
      member: { include: { user: { select: { id: true, name: true, email: true } } } },
      project: { select: { id: true, code: true, title: true } },
      milestone: { select: { id: true, title: true } },
      approvedBy: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: [{ weekStartDate: "desc" }, { member: { user: { name: "asc" } } }],
    take: 200,
  });
  return NextResponse.json({ data: entries });
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
  const parsed = timesheetCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the timesheet details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const totalHrs =
    parsed.data.monday +
    parsed.data.tuesday +
    parsed.data.wednesday +
    parsed.data.thursday +
    parsed.data.friday;

  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: parsed.data.projectId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!project) return { kind: "project" as const };
    if (!(await can(context, "project.read", { projectId: parsed.data.projectId }))) return { kind: "forbidden-project" as const };
    if (parsed.data.milestoneId) {
      const milestone = await tx.milestone.findFirst({
        where: {
          id: parsed.data.milestoneId,
          projectId: parsed.data.projectId,
          organizationId: context.organizationId,
        },
        select: { id: true },
      });
      if (!milestone) return { kind: "milestone" as const };
    }

    const before = await tx.timesheetEntry.findUnique({
      where: {
        organizationId_memberId_projectId_weekStartDate: {
          organizationId: context.organizationId,
          memberId: context.memberId,
          projectId: parsed.data.projectId,
          weekStartDate: parsed.data.weekStartDate,
        },
      },
    });
    if (before && before.status !== TimesheetStatus.DRAFT && before.status !== TimesheetStatus.FLAGGED) {
      return { kind: "locked" as const };
    }

    const entry = before
      ? await tx.timesheetEntry.update({
        where: { id: before.id, organizationId: context.organizationId },
          data: { ...parsed.data, totalHrs, status: TimesheetStatus.DRAFT },
        })
      : await tx.timesheetEntry.create({
          data: {
            ...parsed.data,
            organizationId: context.organizationId,
            memberId: context.memberId,
            totalHrs,
          },
        });

    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: "timesheet",
      entityId: entry.id,
      before: before ? timesheetSnapshot(before) : null,
      after: timesheetSnapshot(entry),
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "saved" as const, data: entry };
  });

  if (result.kind === "project") {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "forbidden-project") {
    return NextResponse.json({ error: "Join this project before logging time against it.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "milestone") {
    return NextResponse.json({ error: "Select a milestone in this project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "locked") {
    return NextResponse.json({ error: "This timesheet has already been submitted or approved.", code: "TIMESHEET_LOCKED" }, { status: 409 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}

function timesheetSnapshot(entry: {
  id: string;
  memberId: string;
  projectId: string;
  weekStartDate: Date;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  totalHrs: number;
  status: TimesheetStatus;
}) {
  return {
    ...entry,
    weekStartDate: entry.weekStartDate.toISOString().slice(0, 10),
  };
}
