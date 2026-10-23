import { AuditAction, Prisma, TimesheetPeriodStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isTransactionConflict, requireTenantRole } from "@/lib/api";
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
  const { periodId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.UPDATE, entityType: "timesheet_period", entityId: periodId, status, error, code,
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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Choose a valid timesheet action.", "VALIDATION_ERROR");
  }
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
    if (isTransactionConflict(error)) return fail(409, "This timesheet changed concurrently. Refresh and review it again.", "CONFLICT");
    throw error;
  }

  if (result.kind === "missing") return fail(404, "Timesheet month not found.", "NOT_FOUND");
  if (result.kind === "forbidden") return fail(403, "You don't have access to change this timesheet.", "FORBIDDEN");
  if (result.kind === "self-review") return fail(403, "You can't approve or reopen your own timesheet.", "FORBIDDEN");
  if (result.kind === "state") return fail(409, "This timesheet month cannot make that status transition.", "INVALID_TRANSITION");
  if (result.kind === "empty") return fail(422, "Log time before submitting this month.", "EMPTY_TIMESHEET");
  return NextResponse.json({ data: result.data });
}
