import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { idSchema } from "@/lib/validations/shared";

type RouteContext = { params: Promise<{ assetId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { assetId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const projectId = typeof body === "object" && body !== null && "projectId" in body ? body.projectId : undefined;
  const parsedId = idSchema.safeParse(projectId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Choose a valid project.", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const [asset, project] = await Promise.all([
        tx.asset.findFirst({ where: { id: assetId, organizationId: context.organizationId }, select: { id: true } }),
        tx.project.findFirst({ where: { id: parsedId.data, organizationId: context.organizationId }, select: { id: true } }),
      ]);
      if (!asset || !project) return null;
      const link = await tx.projectAsset.create({
        data: { organizationId: context.organizationId, projectId: project.id, assetId: asset.id },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "asset",
        entityId: assetId,
        after: { linkedProjectId: project.id, linkedAt: link.linkedAt.toISOString() },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return link;
    });
    if (!result) {
      return NextResponse.json({ error: "Asset or project not found in this organization.", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "This asset is already linked to that project.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
