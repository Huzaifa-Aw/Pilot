import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import { milestoneCreateSchema } from "@/lib/validations/milestone";
import { milestoneProgressPercent } from "@/lib/milestone-progress";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { projectId } = await params;

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await can(context, "project.read", { projectId }))) {
    return NextResponse.json({ error: "You don't have access to this project.", code: "FORBIDDEN" }, { status: 403 });
  }

  const [milestones, completedTasks] = await Promise.all([
    db.milestone.findMany({
      where: { projectId, organizationId: context.organizationId },
      orderBy: { sequenceNumber: "asc" },
      include: { _count: { select: { tasks: true } } },
    }),
    db.task.groupBy({
      by: ["milestoneId"],
      where: { projectId, organizationId: context.organizationId, milestoneId: { not: null }, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);
  const completedByMilestone = new Map(completedTasks.flatMap(({ milestoneId, _count }) =>
    milestoneId ? [[milestoneId, _count._all] as const] : [],
  ));
  return NextResponse.json({
    data: milestones.map((milestone) => ({
      ...milestone,
      completionPct: milestoneProgressPercent(completedByMilestone.get(milestone.id) ?? 0, milestone._count.tasks),
    })),
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.CREATE, entityType: "milestone", status, error, code,
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
  const parsed = milestoneCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the milestone details.", "VALIDATION_ERROR");
  }
  const validation = await prepareMetadataValues(context.organizationId, "milestone", parsed.data.metadata ?? {});
  if (!validation.values) {
    return fail(422, validation.error ?? "Custom values are invalid.", "VALIDATION_ERROR");
  }
  const metadataValues: Prisma.InputJsonObject = validation.values;

  try {
    const milestone = await db.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!project) return null;
      if (!(await can(context, "milestone.create", { projectId }))) return { forbidden: true as const };

      const max = await tx.milestone.aggregate({
        where: { projectId, organizationId: context.organizationId },
        _max: { sequenceNumber: true },
      });
      const created = await tx.milestone.create({
        data: {
          ...parsed.data,
          metadata: metadataValues,
          organizationId: context.organizationId,
          projectId,
          sequenceNumber: parsed.data.sequenceNumber ?? (max._max.sequenceNumber ?? 0) + 1,
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.CREATE,
        entityType: "milestone",
        entityId: created.id,
        after: {
          id: created.id,
          projectId: created.projectId,
          title: created.title,
          status: created.status,
          sequenceNumber: created.sequenceNumber,
        },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return created;
    });

    if (!milestone) {
      return fail(404, "Project not found.", "NOT_FOUND");
    }
    if ("forbidden" in milestone) {
      return fail(403, "Join this project before adding milestones.", "FORBIDDEN");
    }
    return NextResponse.json({ data: milestone }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(409, "That milestone number is already in use for this project.", "CONFLICT");
    }
    throw error;
  }
}
