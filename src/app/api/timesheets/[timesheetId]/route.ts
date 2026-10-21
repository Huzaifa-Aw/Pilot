import { AuditAction, TimesheetStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can, reportTree } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { timesheetUpdateSchema } from "@/lib/validations/timesheet";

type RouteContext = { params: Promise<{ timesheetId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { timesheetId } = await params;
  const visibleMemberIds = roleAtLeast(context.role, "ADMIN")
    ? undefined
    : roleAtLeast(context.role, "MANAGER")
      ? await reportTree(context)
      : [context.memberId];
  const entry = await db.timesheetEntry.findFirst({
    where: {
      id: timesheetId,
      organizationId: context.organizationId,
      ...(visibleMemberIds ? { memberId: { in: visibleMemberIds } } : {}),
    },
    include: {
      member: { include: { user: { select: { name: true, email: true } } } },
      project: { select: { id: true, code: true, title: true } },
      milestone: { select: { id: true, title: true } },
      approvedBy: { include: { user: { select: { name: true } } } },
    },
  });
  if (!entry) {
    return NextResponse.json({ error: "Timesheet not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (entry.memberId !== context.memberId && !(await can(context, "timesheet.team", { memberId: entry.memberId }))) {
    return NextResponse.json({ error: "You can access only your team's timesheets.", code: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ data: entry });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { timesheetId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = timesheetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the timesheet changes.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const before = await tx.timesheetEntry.findFirst({
      where: { id: timesheetId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };
    const ownsEntry = before.memberId === context.memberId;
    const changesHours = ["monday", "tuesday", "wednesday", "thursday", "friday", "notes"]
      .some((key) => Object.hasOwn(parsed.data, key));
    const nextStatus = parsed.data.status;

    if (!ownsEntry && !(await can(context, "timesheet.approve", { memberId: before.memberId }))) return { kind: "forbidden" as const };
    if (!ownsEntry && changesHours && !roleAtLeast(context.role, "ADMIN")) return { kind: "admin" as const };
    if (nextStatus === TimesheetStatus.APPROVED || nextStatus === TimesheetStatus.FLAGGED) {
      if (ownsEntry) return { kind: "self-review" as const };
      if (!(await can(context, "timesheet.approve", { memberId: before.memberId }))) return { kind: "manager" as const };
      if (before.status !== TimesheetStatus.SUBMITTED) return { kind: "transition" as const };
    }
    if (nextStatus === TimesheetStatus.SUBMITTED) {
      if (!ownsEntry || (before.status !== TimesheetStatus.DRAFT && before.status !== TimesheetStatus.FLAGGED)) {
        return { kind: "transition" as const };
      }
    }
    if (changesHours && before.status !== TimesheetStatus.DRAFT && before.status !== TimesheetStatus.FLAGGED) {
      return { kind: "locked" as const };
    }

    const hours = {
      monday: parsed.data.monday ?? before.monday,
      tuesday: parsed.data.tuesday ?? before.tuesday,
      wednesday: parsed.data.wednesday ?? before.wednesday,
      thursday: parsed.data.thursday ?? before.thursday,
      friday: parsed.data.friday ?? before.friday,
    };
    const status = nextStatus ?? (changesHours ? TimesheetStatus.DRAFT : before.status);
    const approvedByMemberId = status === TimesheetStatus.APPROVED ? context.memberId : null;
    await tx.timesheetEntry.update({
      where: { id: timesheetId, organizationId: context.organizationId },
      data: {
        ...hours,
        ...(Object.hasOwn(parsed.data, "notes") ? { notes: parsed.data.notes } : {}),
        totalHrs: hours.monday + hours.tuesday + hours.wednesday + hours.thursday + hours.friday,
        status,
        approvedAt: status === TimesheetStatus.APPROVED ? new Date() : null,
      },
    });
    await tx.timesheetEntry.updateMany({
      where: { id: timesheetId, organizationId: context.organizationId },
      data: { approvedByMemberId },
    });
    const updated = await tx.timesheetEntry.findFirstOrThrow({
      where: { id: timesheetId, organizationId: context.organizationId },
    });

    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "timesheet",
      entityId: timesheetId,
      before: timesheetSnapshot(before),
      after: timesheetSnapshot(updated),
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: updated };
  });

  if (result.kind === "missing") {
    return NextResponse.json({ error: "Timesheet not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return NextResponse.json({ error: "You can update only your own timesheets.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "manager") {
    return NextResponse.json({ error: "A manager is required to approve or flag timesheets.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "admin") {
    return NextResponse.json({ error: "Only an administrator can edit time on behalf of another member.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "self-review") {
    return NextResponse.json({ error: "You can't approve or flag your own timesheet.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "transition") {
    return NextResponse.json({ error: "That timesheet status transition is not allowed.", code: "INVALID_TRANSITION" }, { status: 422 });
  }
  if (result.kind === "locked") {
    return NextResponse.json({ error: "This timesheet is locked. Ask a manager to return it for changes.", code: "TIMESHEET_LOCKED" }, { status: 409 });
  }
  return NextResponse.json({ data: result.data });
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
  approvedByMemberId: string | null;
}) {
  return {
    ...entry,
    weekStartDate: entry.weekStartDate.toISOString().slice(0, 10),
  };
}
