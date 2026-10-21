import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ notificationId: string }> };

export async function PATCH(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { notificationId } = await params;
  const updated = await db.$transaction(async (tx) => {
    const before = await tx.notification.findFirst({
      where: { id: notificationId, organizationId: context.organizationId, memberId: context.memberId },
    });
    if (!before) return null;
    const after = await tx.notification.update({
      where: { id: notificationId },
      data: { readAt: before.readAt ?? new Date() },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "notification",
      entityId: notificationId,
      before: { readAt: before.readAt?.toISOString() ?? null },
      after: { readAt: after.readAt?.toISOString() ?? null },
    }, tx);
    return after;
  });
  if (!updated) return NextResponse.json({ error: "Notification not found.", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: { id: updated.id, readAt: updated.readAt } });
}
