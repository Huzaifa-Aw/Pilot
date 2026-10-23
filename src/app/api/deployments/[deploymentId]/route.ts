import { AuditAction, DeploymentStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { getDeploymentConflicts, tagConflictsByMember } from "@/lib/deployment-conflicts";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { prepareMetadataValues } from "@/lib/metadata";
import { deploymentUpdateSchema } from "@/lib/validations/deployment";

type RouteContext = { params: Promise<{ deploymentId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { deploymentId } = await params;
  const deployment = await db.deployment.findFirst({
    where: { id: deploymentId, organizationId: context.organizationId },
    include: {
      member: { include: { user: { select: { id: true, name: true, email: true } } } },
      members: {
        where: { organizationId: context.organizationId },
        include: { member: { include: { user: { select: { id: true, name: true, email: true } } } } },
      },
      project: { select: { id: true, code: true, title: true } },
    },
  });
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await can(context, "deployment.read", { projectId: deployment.projectId }))) {
    return NextResponse.json({ error: "You don't have access to this deployment.", code: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ data: deployment });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { deploymentId } = await params;
  const fail = (statusCode: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.UPDATE, entityType: "deployment", entityId: deploymentId, status: statusCode, error, code,
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
  const parsed = deploymentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the deployment details.", "VALIDATION_ERROR");
  }

  let result;
  try {
  result = await db.$transaction(async (tx) => {
    const before = await tx.deployment.findFirst({
      where: { id: deploymentId, organizationId: context.organizationId },
      include: { members: { where: { organizationId: context.organizationId }, select: { memberId: true } } },
    });
    if (!before) return null;
    if (!(await can(context, "deployment.update", { projectId: before.projectId }))) return { kind: "forbidden" as const };

    const memberIds = parsed.data.memberIds ?? (parsed.data.memberId
      ? [parsed.data.memberId]
      : before.members.length
        ? before.members.map(({ memberId }) => memberId)
        : [before.memberId]);
    const existingMemberIds = before.members.length ? before.members.map(({ memberId }) => memberId) : [before.memberId];
    const validMembers = await tx.organizationMember.findMany({
      where: {
        id: { in: memberIds },
        organizationId: context.organizationId,
      },
      select: { id: true, isActive: true },
    });
    if (
      validMembers.length !== memberIds.length ||
      validMembers.some(({ id, isActive }) => !isActive && !existingMemberIds.includes(id))
    ) return { kind: "member" as const };
    if (parsed.data.projectId) {
      const project = await tx.project.findFirst({
        where: { id: parsed.data.projectId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!project) return { kind: "project" as const };
    }
    const preparedMetadata = parsed.data.metadata === undefined
      ? null
      : await prepareMetadataValues(
          context.organizationId,
          "deployment",
          parsed.data.metadata ?? {},
          before.metadata,
          tx,
        );
    if (preparedMetadata?.error) return { kind: "metadata" as const, error: preparedMetadata.error };

    const startDate = parsed.data.startDate ?? before.startDate;
    const endDate = parsed.data.endDate ?? before.endDate;
    const status = parsed.data.status ?? before.status;
    if (endDate < startDate) return { kind: "dates" as const };
    const conflicts = tagConflictsByMember(await Promise.all(memberIds.map(async (memberId) => ({
      memberId,
      conflicts: await getDeploymentConflicts({
        organizationId: context.organizationId,
        memberId,
        startDate,
        endDate,
        status,
        client: tx,
      }),
    }))));
    const {
      memberId: submittedMemberId,
      memberIds: submittedMemberIds,
      metadata: submittedMetadata,
      ...fields
    } = parsed.data;
    void submittedMemberId;
    void submittedMemberIds;
    const updated = await tx.deployment.update({
      where: { id: deploymentId, organizationId: context.organizationId },
      data: {
        ...fields,
        memberId: memberIds[0],
        ...(submittedMetadata !== undefined && preparedMetadata ? { metadata: preparedMetadata.values } : {}),
        conflictFlags: conflicts as Prisma.InputJsonValue,
      },
    });
    await tx.deploymentMember.deleteMany({
      where: { deploymentId, organizationId: context.organizationId },
    });
    await tx.deploymentMember.createMany({
      data: memberIds.map((memberId) => ({ deploymentId, memberId, organizationId: context.organizationId })),
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "deployment",
      entityId: deploymentId,
      before: JSON.parse(JSON.stringify({
        id: before.id,
        memberIds: before.members.length ? before.members.map(({ memberId }) => memberId) : [before.memberId],
        projectId: before.projectId,
        title: before.title,
        deploymentType: before.deploymentType,
        location: before.location,
        country: before.country,
        status: before.status,
        startDate: before.startDate.toISOString().slice(0, 10),
        endDate: before.endDate.toISOString().slice(0, 10),
        checklist: before.checklist,
        notes: before.notes,
        metadata: before.metadata,
        conflictFlags: before.conflictFlags,
      })) as Prisma.InputJsonValue,
      after: JSON.parse(JSON.stringify({
        id: updated.id,
        memberIds,
        projectId: updated.projectId,
        title: updated.title,
        deploymentType: updated.deploymentType,
        location: updated.location,
        country: updated.country,
        status: updated.status,
        startDate: updated.startDate.toISOString().slice(0, 10),
        endDate: updated.endDate.toISOString().slice(0, 10),
        checklist: updated.checklist,
        notes: updated.notes,
        metadata: updated.metadata,
        conflictFlags: conflicts,
      })) as Prisma.InputJsonValue,
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: updated };
  });
  } catch (error) {
    throw error;
  }

  if (!result) {
    return fail(404, "Deployment not found.", "NOT_FOUND");
  }
  if (result.kind === "forbidden") {
    return fail(403, "Join this project before changing its deployments.", "FORBIDDEN");
  }
  if (result.kind === "member") {
    return fail(422, "Select active members in this organization.", "VALIDATION_ERROR");
  }
  if (result.kind === "project") {
    return fail(422, "Select a project in this organization.", "VALIDATION_ERROR");
  }
  if (result.kind === "dates") {
    return fail(422, "End date must be on or after the start date.", "VALIDATION_ERROR");
  }
  if (result.kind === "metadata") {
    return fail(422, result.error, "VALIDATION_ERROR");
  }
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { deploymentId } = await params;

  const deployment = await db.$transaction(async (tx) => {
    const before = await tx.deployment.findFirst({
      where: { id: deploymentId, organizationId: context.organizationId },
    });
    if (!before) return null;
    if (!(await can(context, "deployment.update", { projectId: before.projectId }))) return { kind: "forbidden" as const };
    const updated = await tx.deployment.update({
      where: { id: deploymentId, organizationId: context.organizationId },
      data: { status: DeploymentStatus.CANCELLED, conflictFlags: [] },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "deployment",
      entityId: deploymentId,
      before: JSON.parse(JSON.stringify({
        id: before.id,
        memberId: before.memberId,
        status: before.status,
        conflictFlags: before.conflictFlags,
      })) as Prisma.InputJsonValue,
      after: JSON.parse(JSON.stringify({
        id: updated.id,
        memberId: updated.memberId,
        status: updated.status,
        conflictFlags: updated.conflictFlags,
      })) as Prisma.InputJsonValue,
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return updated;
  });
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if ("kind" in deployment && deployment.kind === "forbidden") {
    return NextResponse.json({ error: "Join this project before changing its deployments.", code: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ data: deployment });
}
