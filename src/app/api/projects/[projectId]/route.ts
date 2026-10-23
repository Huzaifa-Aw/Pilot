import { AuditAction, Prisma, ProjectStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { projectUpdateSchema } from "@/lib/validations/project";

type RouteContext = { params: Promise<{ projectId: string }> };

function projectSnapshot(project: {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
  budgetHours: number | null;
  metadata: Prisma.JsonValue | null;
  tags: string[];
}) {
  return {
    id: project.id,
    organizationId: project.organizationId,
    code: project.code,
    title: project.title,
    description: project.description,
    status: project.status,
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
    budgetHours: project.budgetHours,
    metadata: project.metadata,
    tags: project.tags,
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { projectId } = await params;

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    include: {
      milestones: { orderBy: { sequenceNumber: "asc" } },
      tasks: {
        orderBy: [{ status: "asc" }, { priority: "desc" }],
        include: {
          assignments: {
            include: { member: { include: { user: { select: { id: true, name: true } } } } },
          },
        },
      },
      _count: { select: { allocations: true, timesheetEntries: true, assets: true } },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await can(context, "project.read", { projectId }))) {
    return NextResponse.json({ error: "You don't have access to this project.", code: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({ data: project });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { projectId } = await params;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.UPDATE, entityType: "project", entityId: projectId, status, error, code,
  });
  if (!(await can(context, "project.update", { projectId }))) {
    return fail(403, "Join this project before editing it.", "FORBIDDEN");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    }
    throw error;
  }

  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the project details.", "VALIDATION_ERROR");
  }
  try {
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.project.findFirst({
        where: { id: projectId, organizationId: context.organizationId },
      });
      if (!before) return null;
      if (parsed.data.workflowId && !(await tx.taskWorkflow.findFirst({
        where: { id: parsed.data.workflowId, organizationId: context.organizationId },
        select: { id: true },
      }))) {
        return { kind: "workflow" as const };
      }
      if (parsed.data.workflowId && parsed.data.workflowId !== before.workflowId) {
        const currentTasks = await tx.task.findMany({
          where: { projectId, organizationId: context.organizationId },
          select: { id: true, status: true, workflowStatusId: true },
        });
        const nextWorkflowStatuses = await tx.taskWorkflowStatus.findMany({
          where: { workflowId: parsed.data.workflowId, organizationId: context.organizationId, isActive: true },
          select: { id: true, category: true },
          orderBy: { sortOrder: "asc" },
        });
        for (const task of currentTasks) {
          const targetStatus = nextWorkflowStatuses.find(({ category }) => category === task.status);
          if (!targetStatus) return { kind: "workflow-tasks" as const };
          await tx.task.updateMany({
            where: { id: task.id, organizationId: context.organizationId },
            data: { workflowStatusId: targetStatus.id },
          });
          await createAuditEvent({
            organizationId: context.organizationId,
            actorId: context.userId,
            action: AuditAction.UPDATE,
            entityType: "task",
            entityId: task.id,
            before: { workflowStatusId: task.workflowStatusId, status: task.status },
            after: { workflowStatusId: targetStatus.id, status: task.status },
            userAgent: request.headers.get("user-agent"),
          }, tx);
        }
      }

      const metadataResult = parsed.data.metadata !== undefined
        ? await prepareMetadataValues(context.organizationId, "project", parsed.data.metadata, before.metadata, tx)
        : null;
      if (metadataResult?.error) {
        return { kind: "metadata" as const, message: metadataResult.error };
      }
      const after = await tx.project.update({
        where: { id_organizationId: { id: projectId, organizationId: context.organizationId } },
        data: {
          ...parsed.data,
          ...(parsed.data.code ? { code: parsed.data.code.toUpperCase() } : {}),
          ...(metadataResult && !metadataResult.error ? { metadata: metadataResult.values } : {}),
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "project",
        entityId: projectId,
        before: projectSnapshot(before),
        after: projectSnapshot(after),
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return { kind: "updated" as const, data: after };
    });

    if (!updated) {
      return fail(404, "Project not found.", "NOT_FOUND");
    }
    if (updated.kind === "metadata") {
      return fail(422, updated.message, "VALIDATION_ERROR");
    }
    if (updated.kind === "workflow") {
      return fail(422, "Choose a workflow in this organization.", "VALIDATION_ERROR");
    }
    if (updated.kind === "workflow-tasks") {
      return fail(422, "Move the project's tasks to statuses supported by the selected workflow before switching.", "WORKFLOW_STATUS_CONFLICT");
    }
    return NextResponse.json({ data: updated.data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(409, "A project with that code already exists.", "CONFLICT");
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { projectId } = await params;
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";
  if (permanent && !roleAtLeast(context.role, "OWNER")) {
    return NextResponse.json({ error: "Only an owner can permanently delete a project.", code: "FORBIDDEN" }, { status: 403 });
  }

  const result = await db.$transaction(async (tx) => {
    const before = await tx.project.findFirst({
      where: { id: projectId, organizationId: context.organizationId },
      include: {
        milestones: { select: { id: true, title: true, status: true } },
        tasks: { select: { id: true, title: true, status: true } },
        allocations: { select: { id: true, memberId: true, weekStartDate: true, allocationPct: true } },
        deployments: { select: { id: true, memberId: true, startDate: true, endDate: true, status: true } },
      },
    });
    if (!before) return null;
    if (permanent) {
      const worklogCount = await tx.worklog.count({ where: { organizationId: context.organizationId, projectId } });
      if (worklogCount) return { kind: "has-worklogs" as const };
      const checkoutCount = await tx.assetCheckout.count({ where: { organizationId: context.organizationId, projectId } });
      if (checkoutCount) return { kind: "has-checkouts" as const };
    }

    if (permanent) {
      const auditDelete = (entityType: string, entityId: string, beforeValue: Prisma.InputJsonValue) =>
        createAuditEvent({
          organizationId: context.organizationId,
          actorId: context.userId,
          action: AuditAction.DELETE,
          entityType,
          entityId,
          before: beforeValue,
        }, tx);

      await Promise.all([
        ...before.milestones.map((item) => auditDelete("milestone", item.id, item)),
        ...before.tasks.map((item) => auditDelete("task", item.id, item)),
        ...before.allocations.map((item) => auditDelete("resource_allocation", item.id, {
          ...item,
          weekStartDate: item.weekStartDate.toISOString(),
        })),
        ...before.deployments.map((item) => auditDelete("deployment", item.id, {
          ...item,
          startDate: item.startDate.toISOString(),
          endDate: item.endDate.toISOString(),
        })),
      ]);

      await tx.projectAsset.deleteMany({ where: { projectId, organizationId: context.organizationId } });
      await tx.timesheetEntry.deleteMany({ where: { projectId, organizationId: context.organizationId } });
      await tx.resourceAllocation.deleteMany({ where: { projectId, organizationId: context.organizationId } });
      await tx.deployment.deleteMany({ where: { projectId, organizationId: context.organizationId } });
      await tx.taskAssignment.deleteMany({ where: { organizationId: context.organizationId, task: { projectId } } });
      await tx.task.deleteMany({ where: { projectId, organizationId: context.organizationId } });
      await tx.milestone.deleteMany({ where: { projectId, organizationId: context.organizationId } });
      await tx.project.delete({ where: { id_organizationId: { id: projectId, organizationId: context.organizationId } } });
    } else {
      await tx.project.update({
        where: { id_organizationId: { id: projectId, organizationId: context.organizationId } },
        data: { status: ProjectStatus.ARCHIVED },
      });
    }

    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: permanent ? AuditAction.DELETE : AuditAction.UPDATE,
      entityType: "project",
      entityId: projectId,
      before: projectSnapshot(before),
      after: permanent ? null : { ...projectSnapshot(before), status: ProjectStatus.ARCHIVED },
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { id: projectId, archived: !permanent };
  });

  if (!result) {
    return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if ("kind" in result && result.kind === "has-worklogs") {
    return NextResponse.json({ error: "A project with preserved worklogs cannot be permanently deleted. Archive it instead.", code: "HAS_WORKLOGS" }, { status: 409 });
  }
  if ("kind" in result && result.kind === "has-checkouts") {
    return NextResponse.json({ error: "Return checked-out assets before permanently deleting this project.", code: "HAS_CHECKOUTS" }, { status: 409 });
  }
  return NextResponse.json({ data: result });
}
