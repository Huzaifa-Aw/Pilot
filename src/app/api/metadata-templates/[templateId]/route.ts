import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { metadataFieldSchema, metadataTemplateUpdateSchema } from "@/lib/validations/metadata";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { templateId } = await params;
  const template = await db.metadataTemplate.findFirst({
    where: { id: templateId, organizationId: context.organizationId },
  });
  if (!template) {
    return NextResponse.json({ error: "Metadata template not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: template });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { templateId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = metadataTemplateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the metadata template fields.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.metadataTemplate.findFirst({
        where: { id: templateId, organizationId: context.organizationId },
      });
      if (!before) return null;

      const isDefault = parsed.data.isDefault ?? before.isDefault;
      if (isDefault) {
        await tx.metadataTemplate.updateMany({
          where: {
            organizationId: context.organizationId,
            entityType: before.entityType,
            isDefault: true,
            id: { not: templateId },
          },
          data: { isDefault: false, defaultKey: null },
        });
      }

      const next = await tx.metadataTemplate.update({
        where: { id_organizationId: { id: templateId, organizationId: context.organizationId } },
        data: {
          ...parsed.data,
          ...(Object.hasOwn(parsed.data, "fields")
            ? { fields: parsed.data.fields }
            : {}),
          isDefault,
          defaultKey: isDefault ? `${context.organizationId}:${before.entityType}` : null,
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "metadata_template",
        entityId: templateId,
        before: {
          id: before.id,
          entityType: before.entityType,
          name: before.name,
          isDefault: before.isDefault,
          fields: metadataFieldSchema.array().parse(before.fields),
        },
        after: {
          id: next.id,
          entityType: next.entityType,
          name: next.name,
          isDefault: next.isDefault,
          fields: parsed.data.fields ?? metadataFieldSchema.array().parse(next.fields),
        },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return next;
    });

    if (!updated) {
      return NextResponse.json({ error: "Metadata template not found.", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A default template already exists for this entity. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
