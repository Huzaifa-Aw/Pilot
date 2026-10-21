import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { allocationCreateSchema } from "@/lib/validations/allocation";

type RouteContext = { params: Promise<{ projectId: string }> };

function serializeDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function lockWeek(
  tx: Prisma.TransactionClient,
  organizationId: string,
  memberId: string,
  weekStartDate: Date,
) {
  await tx.allocationWeekLock.upsert({
    where: {
      organizationId_memberId_weekStartDate: {
        organizationId,
        memberId,
        weekStartDate,
      },
    },
    create: { organizationId, memberId, weekStartDate },
    update: { version: { increment: 1 } },
  });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { projectId } = await params;

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await can(context, "allocation.read", { projectId }))) {
    return NextResponse.json({ error: "You don't have access to this project's allocations.", code: "FORBIDDEN" }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get("weekStart");
  const weekEnd = request.nextUrl.searchParams.get("weekEnd");
  const memberId = request.nextUrl.searchParams.get("memberId");
  const start = weekStart ? new Date(weekStart) : null;
  const end = weekEnd ? new Date(weekEnd) : null;
  if (
    (weekStart && (Number.isNaN(start?.getTime()) || start?.getUTCDay() !== 1)) ||
    (weekEnd && (Number.isNaN(end?.getTime()) || end?.getUTCDay() !== 1))
  ) {
    return NextResponse.json({ error: "Week filters must be Mondays in ISO date format.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const allocations = await db.resourceAllocation.findMany({
    where: {
      organizationId: context.organizationId,
      projectId,
      ...(memberId ? { memberId } : {}),
      ...(start || end ? {
        weekStartDate: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        },
      } : {}),
    },
    orderBy: [{ weekStartDate: "asc" }, { member: { user: { name: "asc" } } }],
    include: {
      member: { include: { user: { select: { id: true, name: true } } } },
      milestone: { select: { id: true, title: true } },
    },
  });
  return NextResponse.json({ data: allocations });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId } = await params;
  if (!(await can(context, "allocation.update", { projectId }))) {
    return NextResponse.json({ error: "Join this project before changing allocations.", code: "FORBIDDEN" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = allocationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the allocation details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const [project, member] = await Promise.all([
      tx.project.findFirst({
        where: { id: projectId, organizationId: context.organizationId },
        select: { id: true },
      }),
      tx.organizationMember.findFirst({
        where: { id: parsed.data.memberId, organizationId: context.organizationId, isActive: true },
        select: { id: true, capacityHrsPerWeek: true },
      }),
    ]);
    if (!project) return { kind: "project" as const };
    if (!member) return { kind: "member" as const };

    if (
      parsed.data.milestoneId &&
      !(await tx.milestone.findFirst({
        where: {
          id: parsed.data.milestoneId,
          projectId,
          organizationId: context.organizationId,
        },
        select: { id: true },
      }))
    ) {
      return { kind: "milestone" as const };
    }

    const expectedHours = member.capacityHrsPerWeek * parsed.data.allocationPct / 100;
    if (Math.abs(parsed.data.plannedHrs - expectedHours) > 0.01) {
      return { kind: "hours" as const, capacity: member.capacityHrsPerWeek };
    }

    await lockWeek(tx, context.organizationId, member.id, parsed.data.weekStartDate);
    const duplicate = await tx.resourceAllocation.findFirst({
      where: {
        organizationId: context.organizationId,
        memberId: member.id,
        projectId,
        weekStartDate: parsed.data.weekStartDate,
      },
      select: { id: true },
    });
    if (duplicate) return { kind: "duplicate" as const };
    const current = await tx.resourceAllocation.aggregate({
      where: {
        organizationId: context.organizationId,
        memberId: member.id,
        weekStartDate: parsed.data.weekStartDate,
      },
      _sum: { allocationPct: true },
    });
    const total = current._sum.allocationPct ?? 0;
    if (total + parsed.data.allocationPct > 100) {
      return { kind: "overallocated" as const, current: total };
    }

    const allocation = await tx.resourceAllocation.create({
      data: {
        ...parsed.data,
        organizationId: context.organizationId,
        projectId,
        mode: parsed.data.mode ?? "Remote",
      },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.CREATE,
      entityType: "resource_allocation",
      entityId: allocation.id,
      after: {
        id: allocation.id,
        memberId: allocation.memberId,
        projectId: allocation.projectId,
        weekStartDate: serializeDate(allocation.weekStartDate),
        plannedHrs: allocation.plannedHrs,
        allocationPct: allocation.allocationPct,
      },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "created" as const, allocation };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "An allocation for this member, project, and week already exists.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }

  if (result.kind === "project") {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "member") {
    return NextResponse.json({ error: "Select an active member of this organization.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "milestone") {
    return NextResponse.json({ error: "Select a milestone in this project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (result.kind === "hours") {
    return NextResponse.json(
      { error: `Planned hours must match the selected allocation percentage for this member's ${result.capacity}-hour week.`, code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }
  if (result.kind === "duplicate") {
    return NextResponse.json({ error: "An allocation for this member, project, and week already exists.", code: "CONFLICT" }, { status: 409 });
  }
  if (result.kind === "overallocated") {
    return NextResponse.json(
      { error: `Week allocation exceeds 100% — reduce by ${(result.current + parsed.data.allocationPct - 100).toFixed(1)}%.`, code: "OVERALLOCATION" },
      { status: 422 },
    );
  }

  return NextResponse.json({ data: result.allocation }, { status: 201 });
}
