import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { assetUpdateSchema } from "@/lib/validations/asset";

type RouteContext = { params: Promise<{ assetId: string }> };

function assetSnapshot(asset: {
  id: string;
  organizationId: string;
  assetCode: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  location: string | null;
  serialNumber: string | null;
  acquiredOn: Date | null;
  nextServiceDate: Date | null;
  metadata: Prisma.JsonValue | null;
}) {
  return {
    id: asset.id,
    organizationId: asset.organizationId,
    assetCode: asset.assetCode,
    title: asset.title,
    description: asset.description,
    category: asset.category,
    status: asset.status,
    location: asset.location,
    serialNumber: asset.serialNumber,
    acquiredOn: asset.acquiredOn?.toISOString() ?? null,
    nextServiceDate: asset.nextServiceDate?.toISOString() ?? null,
    metadata: asset.metadata,
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { assetId } = await params;
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId: context.organizationId },
    include: {
      projects: {
        where: { organizationId: context.organizationId },
        include: { project: { select: { id: true, code: true, title: true } } },
      },
      checkouts: {
        where: { organizationId: context.organizationId, returnedAt: null },
        take: 1,
        orderBy: { checkedOutAt: "desc" },
        include: {
          member: { include: { user: { select: { name: true, email: true } } } },
          project: { select: { id: true, code: true, title: true } },
          deployment: { select: { id: true, title: true, location: true } },
        },
      },
    },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: asset });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { assetId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.UPDATE, entityType: "asset", entityId: assetId, status, error, code,
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
  const parsed = assetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the asset details.", "VALIDATION_ERROR");
  }
  try {
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.asset.findFirst({
        where: { id: assetId, organizationId: context.organizationId },
      });
      if (!before) return null;
      const metadataResult = parsed.data.metadata !== undefined && parsed.data.metadata !== null
        ? await prepareMetadataValues(context.organizationId, "asset", parsed.data.metadata, before.metadata, tx)
        : null;
      if (metadataResult?.error) return { kind: "metadata" as const, message: metadataResult.error };
      const { metadata, ...assetData } = parsed.data;
      const after = await tx.asset.update({
        where: { id: assetId, organizationId: context.organizationId },
        data: {
          ...assetData,
          ...(Object.hasOwn(parsed.data, "metadata")
            ? { metadata: metadata === null ? Prisma.DbNull : metadataResult?.values ?? metadata }
            : {}),
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "asset",
        entityId: assetId,
        before: assetSnapshot(before),
        after: assetSnapshot(after),
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return { kind: "updated" as const, data: after };
    });
    if (!updated) {
      return fail(404, "Asset not found.", "NOT_FOUND");
    }
    if (updated.kind === "metadata") {
      return fail(422, updated.message, "VALIDATION_ERROR");
    }
    return NextResponse.json({ data: updated.data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(409, "An asset with that code already exists.", "CONFLICT");
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { assetId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.DELETE, entityType: "asset", entityId: assetId, status, error, code,
  });
  const result = await db.$transaction(async (tx) => {
    const before = await tx.asset.findFirst({
      where: { id: assetId, organizationId: context.organizationId },
    });
    if (!before) return null;
    const checkoutCount = await tx.assetCheckout.count({ where: { assetId, organizationId: context.organizationId } });
    if (checkoutCount) return { kind: "has-checkouts" as const };
    await tx.projectAsset.deleteMany({ where: { assetId, organizationId: context.organizationId } });
    await tx.asset.delete({ where: { id: assetId, organizationId: context.organizationId } });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "asset",
      entityId: assetId,
      before: assetSnapshot(before),
      after: null,
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "deleted" as const, id: assetId };
  });
  if (!result) {
    return fail(404, "Asset not found.", "NOT_FOUND");
  }
  if (result.kind === "has-checkouts") {
    return fail(409, "Assets with checkout history can't be deleted. Mark the asset retired instead.", "HAS_HISTORY");
  }
  return NextResponse.json({ data: result });
}
