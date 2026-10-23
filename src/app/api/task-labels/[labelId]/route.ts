import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { taskLabelSchema } from "@/lib/validations/task-workflow";

type RouteContext = { params: Promise<{ labelId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { labelId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({ request, context, action: AuditAction.UPDATE, entityType: "task_label", entityId: labelId, status, error, code });
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
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.taskLabel.findFirst({
        where: { id: labelId, organizationId: context.organizationId },
      });
      if (!before) return null;
      const label = await tx.taskLabel.update({
        where: { id_organizationId: { id: labelId, organizationId: context.organizationId } },
        data: parsed.data,
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "task_label",
        entityId: labelId,
        before: { name: before.name, color: before.color },
        after: { name: label.name, color: label.color },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return label;
    });
    if (!updated) return fail(404, "Label not found.", "NOT_FOUND");
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "A label with that name already exists.", "CONFLICT");
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { labelId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({ request, context, action: AuditAction.DELETE, entityType: "task_label", entityId: labelId, status, error, code });
  const assignmentCount = await db.taskLabelAssignment.count({
    where: { organizationId: context.organizationId, labelId },
  });
  if (assignmentCount) {
    return fail(409, "Remove this label from its tasks before deleting it.", "LABEL_IN_USE");
  }
  const deleted = await db.$transaction(async (tx) => {
    const before = await tx.taskLabel.findFirst({
      where: { id: labelId, organizationId: context.organizationId },
    });
    if (!before) return false;
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "task_label",
      entityId: labelId,
      before: { name: before.name, color: before.color },
      after: null,
      userAgent: request.headers.get("user-agent"),
    }, tx);
    await tx.taskLabel.delete({
      where: { id_organizationId: { id: labelId, organizationId: context.organizationId } },
    });
    return true;
  });
  if (!deleted) return fail(404, "Label not found.", "NOT_FOUND");
  return NextResponse.json({ data: { id: labelId } });
}
