import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ organizationId: string }> };
const transferSchema = z.object({ memberId: z.string().uuid() });

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("OWNER");
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
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose an active organization member.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (parsed.data.memberId === context.memberId) {
    return NextResponse.json({ error: "Choose another member to receive ownership.", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const result = await db.$transaction(async (tx) => {
    const [currentOwner, nextOwner] = await Promise.all([
      tx.organizationMember.findFirst({
        where: { id: context.memberId, organizationId, role: "OWNER", isActive: true },
      }),
      tx.organizationMember.findFirst({
        where: { id: parsed.data.memberId, organizationId, isActive: true },
      }),
    ]);
    if (!currentOwner || !nextOwner) return null;

    const promoted = await tx.organizationMember.update({
      where: { id_organizationId: { id: nextOwner.id, organizationId } },
      data: { role: "OWNER" },
    });
    const demoted = await tx.organizationMember.update({
      where: { id_organizationId: { id: currentOwner.id, organizationId } },
      data: { role: "ADMIN" },
    });

    await Promise.all([
      createAuditEvent({
        organizationId,
        actorId: context.userId,
        action: AuditAction.ROLE_CHANGE,
        entityType: "organization_member",
        entityId: promoted.id,
        before: { memberId: promoted.id, role: nextOwner.role },
        after: { memberId: promoted.id, role: promoted.role },
        userAgent: request.headers.get("user-agent"),
      }, tx),
      createAuditEvent({
        organizationId,
        actorId: context.userId,
        action: AuditAction.ROLE_CHANGE,
        entityType: "organization_member",
        entityId: demoted.id,
        before: { memberId: demoted.id, role: currentOwner.role },
        after: { memberId: demoted.id, role: demoted.role },
        userAgent: request.headers.get("user-agent"),
      }, tx),
    ]);
    return { ownerMemberId: promoted.id, currentMemberRole: demoted.role };
  });

  if (!result) {
    return NextResponse.json({ error: "The selected member is not active in this organization.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: result });
}
