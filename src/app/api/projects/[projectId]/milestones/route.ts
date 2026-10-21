import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import { milestoneCreateSchema } from "@/lib/validations/milestone";

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

  const milestones = await db.milestone.findMany({
    where: { projectId, organizationId: context.organizationId },
    orderBy: { sequenceNumber: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
  return NextResponse.json({ data: milestones });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = milestoneCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the milestone details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const validation = await prepareMetadataValues(context.organizationId, "milestone", parsed.data.metadata ?? {});
  if (!validation.values) {
    return NextResponse.json({ error: validation.error ?? "Custom values are invalid.", code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
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
      return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
    }
    if ("forbidden" in milestone) {
      return NextResponse.json({ error: "Join this project before adding milestones.", code: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ data: milestone }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That milestone number is already in use for this project.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
