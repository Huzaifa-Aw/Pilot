import { AuditAction, DeploymentStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { getDeploymentConflicts, tagConflictsByMember } from "@/lib/deployment-conflicts";
import { db } from "@/lib/db";
import { can, reportTree } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { prepareMetadataValues } from "@/lib/metadata";
import { deploymentCreateSchema } from "@/lib/validations/deployment";
import { idSchema } from "@/lib/validations/shared";

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const memberId = params.get("memberId");
  const projectId = params.get("projectId");
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  if ((memberId && !idSchema.safeParse(memberId).success) || (projectId && !idSchema.safeParse(projectId).success)) {
    return NextResponse.json({ error: "Choose a valid member or project.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (status && !Object.values(DeploymentStatus).some((item) => item === status)) {
    return NextResponse.json({ error: "Choose a valid deployment status.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && Number.isNaN(fromDate?.getTime())) || (to && Number.isNaN(toDate?.getTime()))) {
    return NextResponse.json({ error: "Choose valid date filters.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const teamMemberIds = roleAtLeast(context.role, "ADMIN")
    ? undefined
    : roleAtLeast(context.role, "MANAGER")
      ? await reportTree(context)
      : [context.memberId];
  if (memberId && teamMemberIds && !teamMemberIds.includes(memberId)) {
    return NextResponse.json({ error: "You can view deployments only for yourself or your team.", code: "FORBIDDEN" }, { status: 403 });
  }
  const visibilityFilters: Prisma.DeploymentWhereInput[] = [];
  if (teamMemberIds) {
    visibilityFilters.push({ OR: [
      { memberId: { in: teamMemberIds } },
      { members: { some: { memberId: { in: teamMemberIds }, organizationId: context.organizationId } } },
      { project: { members: { some: { memberId: { in: teamMemberIds } } } } },
    ] });
  }
  if (memberId) {
    visibilityFilters.push({ OR: [
      { memberId },
      { members: { some: { memberId, organizationId: context.organizationId } } },
    ] });
  }
  const deployments = await db.deployment.findMany({
    where: {
      organizationId: context.organizationId,
      ...(visibilityFilters.length ? { AND: visibilityFilters } : {}),
      ...(projectId ? { projectId } : {}),
      ...(status ? { status: status as DeploymentStatus } : {}),
      ...(fromDate || toDate ? {
        startDate: {
          ...(toDate ? { lte: toDate } : {}),
        },
        endDate: {
          ...(fromDate ? { gte: fromDate } : {}),
        },
      } : {}),
    },
    include: {
      member: { include: { user: { select: { id: true, name: true } } } },
      members: {
        where: { organizationId: context.organizationId },
        include: { member: { include: { user: { select: { id: true, name: true } } } } },
      },
      project: { select: { id: true, code: true, title: true } },
    },
    orderBy: { startDate: "asc" },
    take: 200,
  });
  return NextResponse.json({ data: deployments });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (statusCode: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.CREATE, entityType: "deployment", status: statusCode, error, code,
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
  const parsed = deploymentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the deployment details.", "VALIDATION_ERROR");
  }
  if (!(await can(context, "deployment.update", { projectId: parsed.data.projectId }))) {
    return fail(403, "Join this project before scheduling a deployment.", "FORBIDDEN");
  }

  let result;
  try {
  result = await db.$transaction(async (tx) => {
    const memberIds = parsed.data.memberIds ?? (parsed.data.memberId ? [parsed.data.memberId] : []);
    const [members, project] = await Promise.all([
      tx.organizationMember.findMany({
        where: { id: { in: memberIds }, organizationId: context.organizationId, isActive: true },
        select: { id: true },
      }),
      tx.project.findFirst({
        where: { id: parsed.data.projectId, organizationId: context.organizationId },
        select: { id: true },
      }),
    ]);
    if (members.length !== memberIds.length) return { kind: "member" as const };
    if (!project) return { kind: "project" as const };
    const metadata = await prepareMetadataValues(
      context.organizationId,
      "deployment",
      parsed.data.metadata ?? {},
      undefined,
      tx,
    );
    if (metadata.error) return { kind: "metadata" as const, error: metadata.error };

    const status = parsed.data.status ?? DeploymentStatus.UPCOMING;
    const conflictFlags = tagConflictsByMember(await Promise.all(memberIds.map(async (memberId) => ({
      memberId,
      conflicts: await getDeploymentConflicts({
        organizationId: context.organizationId,
        memberId,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        status,
        client: tx,
      }),
    }))));
    const deployment = await tx.deployment.create({
      data: {
        memberId: memberIds[0],
        projectId: parsed.data.projectId,
        title: parsed.data.title,
        deploymentType: parsed.data.deploymentType,
        location: parsed.data.location,
        country: parsed.data.country,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        checklist: parsed.data.checklist,
        notes: parsed.data.notes,
        metadata: metadata.values,
        status,
        organizationId: context.organizationId,
        conflictFlags: conflictFlags as Prisma.InputJsonValue,
      },
    });
    await tx.deploymentMember.createMany({
      data: memberIds.map((memberId) => ({ deploymentId: deployment.id, memberId, organizationId: context.organizationId })),
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.CREATE,
      entityType: "deployment",
      entityId: deployment.id,
      after: JSON.parse(JSON.stringify({
        id: deployment.id,
        memberIds,
        projectId: deployment.projectId,
        title: deployment.title,
        deploymentType: deployment.deploymentType,
        location: deployment.location,
        country: deployment.country,
        status: deployment.status,
        startDate: deployment.startDate.toISOString().slice(0, 10),
        endDate: deployment.endDate.toISOString().slice(0, 10),
        checklist: deployment.checklist,
        notes: deployment.notes,
        metadata: deployment.metadata,
        conflictFlags,
      })) as Prisma.InputJsonValue,
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "created" as const, data: deployment };
    });
  } catch (error) {
    throw error;
  }

  if (result.kind === "member") {
    return fail(422, "Select an active organization member.", "VALIDATION_ERROR");
  }
  if (result.kind === "project") {
    return fail(422, "Select a project in this organization.", "VALIDATION_ERROR");
  }
  if (result.kind === "metadata") {
    return fail(422, result.error, "VALIDATION_ERROR");
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
