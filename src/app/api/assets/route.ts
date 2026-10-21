import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { assetFilterWhere, type AssetAvailability } from "@/lib/asset-filters";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { assetCreateSchema } from "@/lib/validations/asset";
import { idSchema } from "@/lib/validations/shared";

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim().slice(0, 120);
  const category = params.get("category")?.trim().slice(0, 100);
  const rawStatus = params.get("status");
  if (rawStatus && !["AVAILABLE", "IN_USE", "MAINTENANCE", "RETIRED", "INACTIVE"].includes(rawStatus)) {
    return NextResponse.json({ error: "Choose a valid asset availability filter.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const status = ["AVAILABLE", "IN_USE", "MAINTENANCE", "RETIRED", "INACTIVE"].includes(rawStatus ?? "")
    ? rawStatus as AssetAvailability
    : undefined;
  const memberId = params.get("memberId");
  const projectId = params.get("projectId");
  const location = params.get("location")?.trim().slice(0, 160);
  if ((memberId && !idSchema.safeParse(memberId).success) || (projectId && !idSchema.safeParse(projectId).success)) {
    return NextResponse.json({ error: "Choose a valid member or project filter.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const assets = await db.asset.findMany({
    where: assetFilterWhere(context.organizationId, {
      search,
      category,
      status,
      memberId: memberId ?? undefined,
      projectId: projectId ?? undefined,
      location,
    }),
    include: {
      _count: { select: { projects: { where: { organizationId: context.organizationId } } } },
      checkouts: {
        where: { organizationId: context.organizationId, returnedAt: null },
        take: 1,
        orderBy: { checkedOutAt: "desc" },
        include: {
          member: { include: { user: { select: { name: true, email: true } } } },
          project: { select: { id: true, code: true, title: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ data: assets });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = assetCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the asset details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const validation = await prepareMetadataValues(context.organizationId, "asset", parsed.data.metadata ?? {});
  if (!validation.values) {
    return NextResponse.json({ error: validation.error ?? "Custom values are invalid.", code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
  }
  const metadataValues: Prisma.InputJsonObject = validation.values;

  try {
    const asset = await db.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          ...parsed.data,
          metadata: metadataValues,
          organizationId: context.organizationId,
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.CREATE,
        entityType: "asset",
        entityId: created.id,
        after: {
          id: created.id,
          assetCode: created.assetCode,
          title: created.title,
          description: created.description,
          category: created.category,
          status: created.status,
          location: created.location,
          serialNumber: created.serialNumber,
          acquiredOn: created.acquiredOn?.toISOString() ?? null,
          nextServiceDate: created.nextServiceDate?.toISOString() ?? null,
          metadata: created.metadata,
        },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return created;
    });
    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "An asset with that code already exists.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
