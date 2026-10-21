import { AuditAction, Prisma, TimesheetPeriodStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditEvent } from "@/lib/audit";
import { isTransactionConflict, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

type RouteContext = { params: Promise<{ periodId: string }> };
const updateSchema = z.object({
  status: z.enum(["SUBMITTED", "APPROVED", "REOPENED"]),
  reviewNotes: z.string().trim().max(2000).optional(),
});

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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid timesheet action.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  const { periodId } = await params;
  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.timesheetPeriod.findFirst({
      where: { id: periodId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };

    if (parsed.data.status === "SUBMITTED") {
      if (before.memberId !== context.memberId) return { kind: "forbidden" as const };
      if (before.status !== TimesheetPeriodStatus.OPEN && before.status !== TimesheetPeriodStatus.REOPENED) return { kind: "state" as const };
      const entries = await tx.worklog.count({
        where: {
          organizationId: context.organizationId,
          memberId: before.memberId,
          date: {
            gte: before.monthStart,
            lt: new Date(Date.UTC(before.monthStart.getUTCFullYear(), before.monthStart.getUTCMonth() + 1, 1)),
          },
        },
      });
      if (!entries) return { kind: "empty" as const };
    } else {
      if (before.memberId === context.memberId) return { kind: "self-review" as const };
      if (!(await can(context, "timesheet.approve", { memberId: before.memberId }))) return { kind: "forbidden" as const };
      if (parsed.data.status === "APPROVED" && before.status !== TimesheetPeriodStatus.SUBMITTED) return { kind: "state" as const };
      if (parsed.data.status === "REOPENED" && before.status !== TimesheetPeriodStatus.APPROVED && before.status !== TimesheetPeriodStatus.SUBMITTED) return { kind: "state" as const };
    }

    const updated = await tx.timesheetPeriod.update({
      where: { id: periodId, organizationId: context.organizationId },
      data: {
        status: parsed.data.status,
        ...(parsed.data.status === "SUBMITTED" ? { submittedAt: new Date(), approvedByMemberId: null, approvedAt: null } : {}),
        ...(parsed.data.status === "APPROVED" ? { approvedByMemberId: context.memberId, approvedAt: new Date() } : {}),
        ...(parsed.data.status === "REOPENED" ? { approvedByMemberId: null, approvedAt: null } : {}),
        ...(parsed.data.reviewNotes !== undefined ? { reviewNotes: parsed.data.reviewNotes } : {}),
      },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "timesheet_period",
      entityId: periodId,
      before: { status: before.status, submittedAt: before.submittedAt?.toISOString() ?? null, approvedAt: before.approvedAt?.toISOString() ?? null },
      after: { status: updated.status, submittedAt: updated.submittedAt?.toISOString() ?? null, approvedAt: updated.approvedAt?.toISOString() ?? null },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isTransactionConflict(error)) return NextResponse.json({ error: "This timesheet changed concurrently. Refresh and review it again.", code: "CONFLICT" }, { status: 409 });
    throw error;
  }

  if (result.kind === "missing") return NextResponse.json({ error: "Timesheet month not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "forbidden") return NextResponse.json({ error: "You don't have access to change this timesheet.", code: "FORBIDDEN" }, { status: 403 });
  if (result.kind === "self-review") return NextResponse.json({ error: "You can't approve or reopen your own timesheet.", code: "FORBIDDEN" }, { status: 403 });
  if (result.kind === "state") return NextResponse.json({ error: "This timesheet month cannot make that status transition.", code: "INVALID_TRANSITION" }, { status: 409 });
  if (result.kind === "empty") return NextResponse.json({ error: "Log time before submitting this month.", code: "EMPTY_TIMESHEET" }, { status: 422 });
  return NextResponse.json({ data: result.data });
}
