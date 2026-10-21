import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { allocationUpdateSchema } from "@/lib/validations/allocation";

type RouteContext = { params: Promise<{ allocationId: string }> };

function allocationSnapshot(allocation: {
  id: string;
  organizationId: string;
  memberId: string;
  projectId: string;
  milestoneId: string | null;
  weekStartDate: Date;
  plannedHrs: number;
  allocationPct: number;
  mode: string;
}) {
  return {
    ...allocation,
    weekStartDate: allocation.weekStartDate.toISOString().slice(0, 10),
  };
}

async function lockWeek(
  tx: Prisma.TransactionClient,
  organizationId: string,
  memberId: string,
  weekStartDate: Date,
) {
  await tx.allocationWeekLock.upsert({
    where: {
      organizationId_memberId_weekStartDate: { organizationId, memberId, weekStartDate },
    },
    create: { organizationId, memberId, weekStartDate },
    update: { version: { increment: 1 } },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { allocationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = allocationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the allocation details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.resourceAllocation.findFirst({
      where: { id: allocationId, organizationId: context.organizationId },
      include: { member: { select: { capacityHrsPerWeek: true } } },
    });
    if (!before) return { kind: "missing" as const };
    if (!(await can(context, "allocation.update", { projectId: before.projectId, memberId: before.memberId }))) {
      return { kind: "forbidden" as const };
    }

    const nextWeek = parsed.data.weekStartDate ?? before.weekStartDate;
    const weeks = [before.weekStartDate, nextWeek]
      .map((date) => date.toISOString().slice(0, 10))
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();
    for (const week of weeks) {
      await lockWeek(tx, context.organizationId, before.memberId, new Date(`${week}T00:00:00.000Z`));
    }

    const nextPercentage = parsed.data.allocationPct ?? before.allocationPct;
    const nextHours = parsed.data.plannedHrs ?? before.plannedHrs;
    const expectedHours = before.member.capacityHrsPerWeek * nextPercentage / 100;
    if (Math.abs(nextHours - expectedHours) > 0.01) {
      return { kind: "hours" as const, capacity: before.member.capacityHrsPerWeek };
    }

    if (parsed.data.milestoneId) {
      const milestone = await tx.milestone.findFirst({
        where: {
          id: parsed.data.milestoneId,
          projectId: before.projectId,
          organizationId: context.organizationId,
        },
        select: { id: true },
      });
      if (!milestone) return { kind: "milestone" as const };
    }

    const total = await tx.resourceAllocation.aggregate({
      where: {
        organizationId: context.organizationId,
        memberId: before.memberId,
        weekStartDate: nextWeek,
        id: { not: allocationId },
      },
      _sum: { allocationPct: true },
    });
    const currentTotal = total._sum.allocationPct ?? 0;
    if (currentTotal + nextPercentage > 100) {
      return { kind: "overallocated" as const, current: currentTotal, next: nextPercentage };
    }

    const { milestoneId, ...allocationData } = parsed.data;
    await tx.resourceAllocation.update({
      where: { id: allocationId, organizationId: context.organizationId },
      data: allocationData,
    });
    if (Object.hasOwn(parsed.data, "milestoneId")) {
      await tx.resourceAllocation.updateMany({
        where: { id: allocationId, organizationId: context.organizationId },
        data: { milestoneId: milestoneId ?? null },
      });
    }
    const updated = await tx.resourceAllocation.findFirstOrThrow({
      where: { id: allocationId, organizationId: context.organizationId },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "resource_allocation",
      entityId: allocationId,
      before: allocationSnapshot(before),
      after: allocationSnapshot(updated),
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "An allocation for this member, project, and week already exists.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }

  if (result.kind === "missing") {
    return NextResponse.json({ error: "Allocation not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "forbidden") {
    return NextResponse.json({ error: "You can change allocations only within your team and project scope.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "hours") {
    return NextResponse.json(
      { error: `Planned hours must match the selected allocation percentage for this member's ${result.capacity}-hour week.`, code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }
  if (result.kind === "milestone") {
    return NextResponse.json({ error: "Select a milestone in this project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "overallocated") {
    return NextResponse.json(
      { error: `Week allocation exceeds 100% — reduce by ${(result.current + result.next - 100).toFixed(1)}%.`, code: "OVERALLOCATION" },
      { status: 422 },
    );
  }
  return NextResponse.json({ data: result.data });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { allocationId } = await params;

  const deleted = await db.$transaction(async (tx) => {
    const before = await tx.resourceAllocation.findFirst({
      where: { id: allocationId, organizationId: context.organizationId },
    });
    if (!before) return null;
    if (!(await can(context, "allocation.update", { projectId: before.projectId, memberId: before.memberId }))) return { kind: "forbidden" as const };
    await lockWeek(tx, context.organizationId, before.memberId, before.weekStartDate);
    await tx.resourceAllocation.delete({
      where: { id: allocationId, organizationId: context.organizationId },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "resource_allocation",
      entityId: allocationId,
      before: allocationSnapshot(before),
      after: null,
    }, tx);
    return { id: allocationId };
  });
  if (!deleted) {
    return NextResponse.json({ error: "Allocation not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if ("kind" in deleted && deleted.kind === "forbidden") {
    return NextResponse.json({ error: "You can change allocations only within your team and project scope.", code: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ data: deleted });
}
