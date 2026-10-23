import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { taskLabelSchema } from "@/lib/validations/task-workflow";

export async function GET() {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const labels = await db.taskLabel.findMany({
    where: { organizationId: context.organizationId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ data: labels });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({ request, context, action: AuditAction.CREATE, entityType: "task_label", status, error, code });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    throw error;
  }
  const parsed = taskLabelSchema.safeParse(body);
  if (!parsed.success) return fail(422, "Check the label details.", "VALIDATION_ERROR");
  try {
    const label = await db.$transaction(async (tx) => {
      const created = await tx.taskLabel.create({ data: { ...parsed.data, organizationId: context.organizationId } });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.CREATE,
        entityType: "task_label",
        entityId: created.id,
        after: { id: created.id, name: created.name, color: created.color },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return created;
    });
    return NextResponse.json({ data: label }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "A label with that name already exists.", "CONFLICT");
    throw error;
  }
}
