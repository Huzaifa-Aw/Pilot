import { AuditAction, MilestoneStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isTransactionConflict, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import { milestoneUpdateSchema } from "@/lib/validations/milestone";

type RouteContext = { params: Promise<{ projectId: string; milestoneId: string }> };

function milestoneSnapshot(milestone: {
  id: string;
  projectId: string;
  organizationId: string;
  title: string;
  status: MilestoneStatus;
  sequenceNumber: number;
  completionPct: number;
  requiresSignoff: boolean;
  signoffByMemberId: string | null;
  signoffAt: Date | null;
  targetDate: Date | null;
  startDate: Date | null;
  description: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    organizationId: milestone.organizationId,
    title: milestone.title,
    status: milestone.status,
    sequenceNumber: milestone.sequenceNumber,
    completionPct: milestone.completionPct,
    requiresSignoff: milestone.requiresSignoff,
    signoffByMemberId: milestone.signoffByMemberId,
    signoffAt: milestone.signoffAt?.toISOString() ?? null,
    targetDate: milestone.targetDate?.toISOString() ?? null,
    startDate: milestone.startDate?.toISOString() ?? null,
    description: milestone.description,
    metadata: milestone.metadata,
  };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId, milestoneId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.UPDATE, entityType: "milestone", entityId: milestoneId, status, error, code,
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
  const parsed = milestoneUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the milestone details.", "VALIDATION_ERROR");
  }
  if (!(await can(context, "milestone.update", { projectId }))) {
    return fail(403, "Join this project as a manager before changing milestones.", "FORBIDDEN");
  }
  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const before = await tx.milestone.findFirst({
      where: { id: milestoneId, projectId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };
    if (parsed.data.updatedAt && before.updatedAt.toISOString() !== parsed.data.updatedAt) {
      return { kind: "conflict" as const };
    }

    const metadataResult = parsed.data.metadata !== undefined && parsed.data.metadata !== null
      ? await prepareMetadataValues(context.organizationId, "milestone", parsed.data.metadata, before.metadata, tx)
      : null;
    if (metadataResult?.error) return { kind: "metadata" as const, message: metadataResult.error };

    const nextStatus = parsed.data.status ?? before.status;
    const nextRequiresSignoff = parsed.data.requiresSignoff ?? before.requiresSignoff;
    const nextSignerId = Object.hasOwn(parsed.data, "signoffByMemberId")
      ? parsed.data.signoffByMemberId
      : before.signoffByMemberId;
    if (
      nextRequiresSignoff &&
      (nextStatus === MilestoneStatus.APPROVED || nextStatus === MilestoneStatus.COMPLETED) &&
      !nextSignerId
    ) {
      return { kind: "signoff" as const };
    }

    if (parsed.data.signoffByMemberId) {
      const signer = await tx.organizationMember.findFirst({
        where: {
          id: parsed.data.signoffByMemberId,
          organizationId: context.organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!signer) return { kind: "signer" as const };
    }

    const { signoffByMemberId, metadata, ...milestoneData } = parsed.data;
    delete milestoneData.updatedAt;
    const nextSequenceNumber = milestoneData.sequenceNumber ?? before.sequenceNumber;
    delete milestoneData.sequenceNumber;
    const updateData = {
      ...milestoneData,
      sequenceNumber: nextSequenceNumber,
      ...(metadataResult ? { metadata: metadataResult.values } : {}),
      ...(Object.hasOwn(parsed.data, "metadata")
        ? { metadata: metadata === null ? Prisma.DbNull : metadataResult?.values ?? metadata }
        : {}),
      ...(Object.hasOwn(parsed.data, "signoffByMemberId")
        ? { signoffByMemberId: signoffByMemberId ?? null, signoffAt: signoffByMemberId ? new Date() : null }
        : {}),
    };
    let updateTimestamp = before.updatedAt;
    if (nextSequenceNumber !== before.sequenceNumber) {
      const maximum = await tx.milestone.aggregate({
        where: { projectId, organizationId: context.organizationId },
        _max: { sequenceNumber: true },
      });
      const temporary = await tx.milestone.updateMany({
        where: { id: milestoneId, projectId, organizationId: context.organizationId, updatedAt: before.updatedAt },
        data: { sequenceNumber: (maximum._max.sequenceNumber ?? 0) + 1 },
      });
      if (temporary.count !== 1) return { kind: "conflict" as const };
      const moved = await tx.milestone.findFirst({
        where: { id: milestoneId, projectId, organizationId: context.organizationId },
        select: { updatedAt: true },
      });
      if (!moved) return { kind: "missing" as const };
      updateTimestamp = moved.updatedAt;
      const displaced = await tx.milestone.findFirst({
        where: { projectId, organizationId: context.organizationId, sequenceNumber: nextSequenceNumber },
        select: { id: true },
      });
      if (displaced && displaced.id !== milestoneId) {
        await tx.milestone.updateMany({
          where: { id: displaced.id, projectId, organizationId: context.organizationId },
          data: { sequenceNumber: before.sequenceNumber },
        });
      }
    }
    const update = await tx.milestone.updateMany({
      where: { id: milestoneId, projectId, organizationId: context.organizationId, updatedAt: updateTimestamp },
      data: updateData,
    });
    if (update.count !== 1) {
      return { kind: "conflict" as const };
    }
    const updated = await tx.milestone.findFirstOrThrow({
      where: { id: milestoneId, projectId, organizationId: context.organizationId },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "milestone",
      entityId: milestoneId,
      before: milestoneSnapshot(before),
      after: milestoneSnapshot(updated),
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isTransactionConflict(error)) {
      return fail(409, "Milestone order changed concurrently. Refresh and try again.", "CONFLICT");
    }
    throw error;
  }

  if (result.kind === "missing") {
    return fail(404, "Milestone not found.", "NOT_FOUND");
  }
  if (result.kind === "conflict") {
    return fail(409, "This milestone changed since you opened it. Refresh and try again.", "CONFLICT");
  }
  if (result.kind === "signoff") {
    return fail(422, "Select an organization member to sign off before approving or completing this milestone.", "SIGNOFF_REQUIRED");
  }
  if (result.kind === "signer") {
    return fail(422, "The selected signoff member is not active in this organization.", "VALIDATION_ERROR");
  }
  if (result.kind === "metadata") {
    return fail(422, result.message, "VALIDATION_ERROR");
  }

  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId, milestoneId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.DELETE, entityType: "milestone", entityId: milestoneId, status, error, code,
  });
  if (!(await can(context, "milestone.update", { projectId }))) {
    return fail(403, "Join this project as a manager before changing milestones.", "FORBIDDEN");
  }

  const result = await db.$transaction(async (tx) => {
    const before = await tx.milestone.findFirst({
      where: { id: milestoneId, projectId, organizationId: context.organizationId },
      include: { _count: { select: { tasks: true, allocations: true, timesheetEntries: true } } },
    });
    if (!before) return { kind: "missing" as const };
    if (before._count.tasks || before._count.allocations || before._count.timesheetEntries) return { kind: "has-tasks" as const };
    await tx.milestone.delete({
      where: { id_organizationId: { id: milestoneId, organizationId: context.organizationId } },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "milestone",
      entityId: milestoneId,
      before: milestoneSnapshot(before),
      after: null,
    }, tx);
    return { kind: "deleted" as const };
  });
  if (result.kind === "missing") {
    return fail(404, "Milestone not found.", "NOT_FOUND");
  }
  if (result.kind === "has-tasks") {
    return fail(409, "Move or remove its tasks before deleting this milestone.", "HAS_TASKS");
  }
  return NextResponse.json({ data: { id: milestoneId } });
}
