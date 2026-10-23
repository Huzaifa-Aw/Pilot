import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { taskWorkflowCreateSchema } from "@/lib/validations/task-workflow";

const taskFields = ["title", "description", "priority", "assigneeIds", "estimatedHrs", "actualHrs", "startDate", "dueDate", "milestoneId", "requiredDiscipline", "labelIds"];

async function readJson(request: NextRequest) {
  try {
    return { body: await request.json(), error: null };
  } catch (error) {
    if (error instanceof SyntaxError) return { body: null, error: "Request body must be valid JSON." };
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.CREATE, entityType: "task_workflow", status, error, code,
  });
  const { body, error } = await readJson(request);
  if (error) return fail(400, error, "VALIDATION_ERROR");
  const parsed = taskWorkflowCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the workflow details.", "VALIDATION_ERROR");
  }
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "task");
  const allowedFields = new Set([...taskFields, ...metadataFields.map(({ key }) => key)]);
  if (parsed.data.statuses.some((status) => status.requiredFieldKeys.some((key) => !allowedFields.has(key)))) {
    return fail(422, "A workflow requires a task field that is no longer configured.", "VALIDATION_ERROR");
  }

  try {
    const workflow = await db.$transaction(async (tx) => {
    const isFirst = !(await tx.taskWorkflow.findFirst({ where: { organizationId: context.organizationId }, select: { id: true } }));
    const created = await tx.taskWorkflow.create({
      data: {
        organizationId: context.organizationId,
        name: parsed.data.name,
        isDefault: isFirst,
      },
    });
    const statusIds = new Map<string, string>();
    for (const status of parsed.data.statuses) {
      const createdStatus = await tx.taskWorkflowStatus.create({
        data: {
          organizationId: context.organizationId,
          workflowId: created.id,
          key: status.key,
          name: status.name,
          category: status.category,
          sortOrder: status.sortOrder,
          isInitial: status.isInitial,
          requiredFieldKeys: status.requiredFieldKeys,
        },
      });
      statusIds.set(status.key, createdStatus.id);
    }
    await tx.taskWorkflowTransition.createMany({
      data: parsed.data.transitions.map(({ fromKey, toKey }) => ({
        organizationId: context.organizationId,
        workflowId: created.id,
        fromStatusId: statusIds.get(fromKey)!,
        toStatusId: statusIds.get(toKey)!,
      })),
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.CREATE,
      entityType: "task_workflow",
      entityId: created.id,
      after: { name: created.name, statusCount: statusIds.size },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return tx.taskWorkflow.findFirstOrThrow({
      where: { id: created.id, organizationId: context.organizationId },
      include: {
        statuses: { orderBy: { sortOrder: "asc" } },
        transitions: { select: { fromStatusId: true, toStatusId: true } },
      },
    });
    });
    return NextResponse.json({ data: workflow }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "A workflow with that name already exists.", "CONFLICT");
    throw error;
  }
}

export async function GET() {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const workflows = await db.taskWorkflow.findMany({
    where: { organizationId: context.organizationId },
    include: {
      statuses: { orderBy: { sortOrder: "asc" } },
      transitions: { select: { fromStatusId: true, toStatusId: true } },
      _count: { select: { projects: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ data: workflows });
}
