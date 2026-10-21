import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { organizationUpdateSchema } from "@/lib/validations/organization";

type RouteContext = { params: Promise<{ organizationId: string }> };

function organizationSnapshot(organization: {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  industry: string | null;
  timezone: string;
  locale: string;
  isActive: boolean;
}) {
  return organization;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { organizationId } = await params;
  if (organizationId !== context.organizationId) {
    return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  const organization = await db.organization.findUnique({
    where: { id: context.organizationId },
  });
  if (!organization) {
    return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: organization });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { organizationId } = await params;
  if (organizationId !== context.organizationId) {
    return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = organizationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the organization settings.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({ where: { id: context.organizationId } });
      if (!before) return null;
      const after = await tx.organization.update({
        where: { id: context.organizationId },
        data: {
          ...parsed.data,
          ...(parsed.data.slug ? { slug: parsed.data.slug.toLowerCase() } : {}),
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "organization",
        entityId: context.organizationId,
        before: organizationSnapshot(before),
        after: organizationSnapshot(after),
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return after;
    });
    if (!updated) {
      return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That organization URL is already in use.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("OWNER");
  if (response) return response;
  const { organizationId } = await params;
  if (organizationId !== context.organizationId) {
    return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  const deleted = await db.$transaction(async (tx) => {
    const before = await tx.organization.findUnique({
      where: { id: context.organizationId, isActive: true },
    });
    if (!before) return null;

    const members = await tx.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, userId: true, role: true },
    });
    await tx.organization.update({
      where: { id: context.organizationId },
      data: { isActive: false },
    });
    await tx.organizationMember.updateMany({
      where: { organizationId: context.organizationId, isActive: true },
      data: { isActive: false },
    });

    await Promise.all([
      ...members.map((member) => createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "organization_member",
        entityId: member.id,
        before: { id: member.id, role: member.role, isActive: true, userId: member.userId },
        after: { id: member.id, role: member.role, isActive: false, userId: member.userId },
        userAgent: _request.headers.get("user-agent"),
      }, tx)),
      createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.DELETE,
        entityType: "organization",
        entityId: context.organizationId,
        before: organizationSnapshot(before),
        after: { id: context.organizationId, isActive: false },
        userAgent: _request.headers.get("user-agent"),
      }, tx),
    ]);

    const nextMembership = await tx.organizationMember.findFirst({
      where: {
        userId: context.userId,
        isActive: true,
        organizationId: { not: context.organizationId },
        organization: { isActive: true },
      },
      orderBy: { organization: { name: "asc" } },
      select: { organizationId: true },
    });
    return { deleted: true, nextOrganizationId: nextMembership?.organizationId ?? null };
  });

  if (!deleted) {
    return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: deleted });
}
