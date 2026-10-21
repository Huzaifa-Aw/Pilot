import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { idSchema, parsePage } from "@/lib/validations/shared";

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const { page, pageSize } = parsePage(params);
  const entityType = params.get("entityType")?.trim().slice(0, 64);
  const entityId = params.get("entityId");
  const actorId = params.get("actorId");
  const action = params.get("action");
  const from = params.get("from");
  const to = params.get("to");

  if ((entityId && !idSchema.safeParse(entityId).success) || (actorId && !idSchema.safeParse(actorId).success)) {
    return NextResponse.json({ error: "Choose a valid entity or actor ID.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (action && !Object.values(AuditAction).some((value) => value === action)) {
    return NextResponse.json({ error: "Choose a valid audit action.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && Number.isNaN(fromDate?.getTime())) || (to && Number.isNaN(toDate?.getTime()))) {
    return NextResponse.json({ error: "Choose valid date filters.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const where: Prisma.AuditLogWhereInput = {
    organizationId: context.organizationId,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(action ? { action: action as AuditAction } : {}),
    ...(fromDate || toDate ? {
      createdAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    } : {}),
  };
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.count({ where }),
  ]);
  return NextResponse.json({ data: entries, meta: { total, page, pageSize } });
}
