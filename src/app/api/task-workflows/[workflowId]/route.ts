import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { taskWorkflowUpdateSchema } from "@/lib/validations/task-workflow";

type RouteContext = { params: Promise<{ workflowId: string }> };
const taskFields = ["title", "description", "priority", "assigneeIds", "estimatedHrs", "actualHrs", "startDate", "dueDate", "milestoneId", "requiredDiscipline", "labelIds"];

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { workflowId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.UPDATE, entityType: "task_workflow", entityId: workflowId, status, error, code,
  });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    throw error;
  }
  const parsed = taskWorkflowUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the workflow details.", "VALIDATION_ERROR");
  }
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "task");
  const allowedFields = new Set([...taskFields, ...metadataFields.map(({ key }) => key)]);
  if (parsed.data.statuses.some((status) => status.requiredFieldKeys.some((key) => !allowedFields.has(key)))) {
    return fail(422, "A workflow requires a task field that is no longer configured.", "VALIDATION_ERROR");
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.taskWorkflow.findFirst({
        where: { id: workflowId, organizationId: context.organizationId },
        include: { statuses: true },
      });
      if (!before) return { kind: "missing" as const };
      const submittedIds = parsed.data.statuses.flatMap(({ id }) => id ? [id] : []);
      if (new Set(submittedIds).size !== submittedIds.length || submittedIds.some((id) => !before.statuses.some((status) => status.id === id))) {
        return { kind: "invalid-status" as const };
      }
      const removedStatuses = before.statuses.filter(({ id }) => !submittedIds.includes(id));
      const nextCategories = new Set(parsed.data.statuses.map(({ category }) => category));
      const changedCategoryIds = parsed.data.statuses.flatMap((next) => {
        const previous = before.statuses.find(({ id }) => id === next.id);
        return previous && previous.category !== next.category ? [previous.id] : [];
      });
      if (changedCategoryIds.length && await tx.task.count({
        where: { organizationId: context.organizationId, workflowStatusId: { in: changedCategoryIds } },
      })) {
        return { kind: "status-in-use" as const };
      }
      const affectedTasks = removedStatuses.length
        ? await tx.task.findMany({
            where: { organizationId: context.organizationId, workflowStatusId: { in: removedStatuses.map(({ id }) => id) } },
              select: { id: true, status: true, workflowStatusId: true },
          })
        : [];
      if (affectedTasks.some(({ status }) => !nextCategories.has(status))) return { kind: "status-in-use" as const };
      if (parsed.data.isDefault === false && before.isDefault) {
        const otherDefault = await tx.taskWorkflow.findFirst({
          where: { organizationId: context.organizationId, isDefault: true, id: { not: workflowId } },
          select: { id: true },
        });
        if (!otherDefault) return { kind: "default-required" as const };
      }
      if (parsed.data.isDefault) {
        await tx.taskWorkflow.updateMany({
          where: { organizationId: context.organizationId, id: { not: workflowId }, isDefault: true },
          data: { isDefault: false },
        });
      }
      const updatedWorkflow = await tx.taskWorkflow.update({
        where: { id_organizationId: { id: workflowId, organizationId: context.organizationId } },
        data: {
          name: parsed.data.name,
          ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
        },
      });
      const statusIds = new Map<string, string>();
      for (const status of parsed.data.statuses) {
        const { id, ...data } = status;
        const saved = id
          ? await tx.taskWorkflowStatus.update({
              where: { id_organizationId: { id, organizationId: context.organizationId } },
              data: { ...data, workflowId },
            })
          : await tx.taskWorkflowStatus.create({
              data: { ...data, workflowId, organizationId: context.organizationId },
            });
        statusIds.set(saved.key, saved.id);
      }
      for (const task of affectedTasks) {
        const target = parsed.data.statuses.find(({ category }) => category === task.status);
        if (!target) return { kind: "status-in-use" as const };
        await tx.task.update({
          where: { id_organizationId: { id: task.id, organizationId: context.organizationId } },
          data: { workflowStatusId: statusIds.get(target.key) },
        });
        await createAuditEvent({
          organizationId: context.organizationId,
          actorId: context.userId,
          action: AuditAction.UPDATE,
          entityType: "task",
          entityId: task.id,
          before: { workflowStatusId: task.workflowStatusId, status: task.status },
          after: { workflowStatusId: statusIds.get(target.key), status: task.status },
          userAgent: request.headers.get("user-agent"),
        }, tx);
      }
      if (removedStatuses.length) {
        await tx.taskWorkflowStatus.deleteMany({
          where: { id: { in: removedStatuses.map(({ id }) => id) }, organizationId: context.organizationId },
        });
      }
      await tx.taskWorkflowTransition.deleteMany({
        where: { organizationId: context.organizationId, workflowId },
      });
      await tx.taskWorkflowTransition.createMany({
        data: parsed.data.transitions.map(({ fromKey, toKey }) => ({
          organizationId: context.organizationId,
          workflowId,
          fromStatusId: statusIds.get(fromKey)!,
          toStatusId: statusIds.get(toKey)!,
        })),
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "task_workflow",
        entityId: workflowId,
        before: { name: before.name, isDefault: before.isDefault, statuses: before.statuses.map(({ key, name, category }) => ({ key, name, category })) },
        after: { name: updatedWorkflow.name, isDefault: updatedWorkflow.isDefault, statusCount: statusIds.size },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return { kind: "updated" as const };
    });
    if (result.kind === "missing") return fail(404, "Workflow not found.", "NOT_FOUND");
    if (result.kind === "invalid-status") return fail(422, "A workflow status does not belong to this workflow.", "VALIDATION_ERROR");
    if (result.kind === "status-in-use") return fail(409, "Keep each task's current status category available before removing or changing it.", "WORKFLOW_STATUS_CONFLICT");
    if (result.kind === "default-required") return fail(409, "Choose another default workflow before removing the current default.", "DEFAULT_WORKFLOW_REQUIRED");
    return NextResponse.json({ data: { id: workflowId } });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "A workflow with that name already exists.", "CONFLICT");
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { workflowId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.DELETE, entityType: "task_workflow", entityId: workflowId, status, error, code,
  });
  const workflow = await db.taskWorkflow.findFirst({
    where: { id: workflowId, organizationId: context.organizationId },
    include: { _count: { select: { projects: true } } },
  });
  if (!workflow) return fail(404, "Workflow not found.", "NOT_FOUND");
  if (workflow.isDefault || workflow._count.projects > 0) {
    return fail(409, "Reassign projects and choose another default workflow before deleting this workflow.", "WORKFLOW_IN_USE");
  }
  await db.$transaction(async (tx) => {
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.DELETE,
      entityType: "task_workflow",
      entityId: workflow.id,
      before: { name: workflow.name },
      after: null,
    }, tx);
    await tx.taskWorkflow.delete({
      where: { id_organizationId: { id: workflowId, organizationId: context.organizationId } },
    });
  });
  return NextResponse.json({ data: { id: workflowId } });
}
