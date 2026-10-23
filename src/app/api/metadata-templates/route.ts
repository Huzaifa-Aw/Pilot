import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { metadataTemplateCreateSchema } from "@/lib/validations/metadata";
import { METADATA_ENTITY_TYPES } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const entityType = request.nextUrl.searchParams.get("entityType");
  if (entityType && !METADATA_ENTITY_TYPES.some((value) => value === entityType)) {
    return NextResponse.json({ error: "Choose a supported entity type.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const templates = await db.metadataTemplate.findMany({
    where: {
      organizationId: context.organizationId,
      ...(entityType ? { entityType } : {}),
    },
    orderBy: [{ entityType: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ data: templates });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ADMIN");
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
  const parsed = metadataTemplateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the metadata template fields.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const template = await db.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.metadataTemplate.updateMany({
          where: { organizationId: context.organizationId, entityType: parsed.data.entityType, isDefault: true },
          data: { isDefault: false, defaultKey: null },
        });
      }
      const created = await tx.metadataTemplate.create({
        data: {
          organizationId: context.organizationId,
          entityType: parsed.data.entityType,
          name: parsed.data.name,
          fields: parsed.data.fields,
          isDefault: parsed.data.isDefault ?? false,
          defaultKey: parsed.data.isDefault
            ? `${context.organizationId}:${parsed.data.entityType}`
            : null,
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.CREATE,
        entityType: "metadata_template",
        entityId: created.id,
        after: {
          id: created.id,
          entityType: created.entityType,
          name: created.name,
          isDefault: created.isDefault,
          fields: parsed.data.fields,
        },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return created;
    });
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A default template already exists for this entity. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
