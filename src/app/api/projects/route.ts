import { AuditAction, Prisma, ProjectStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { parsePage } from "@/lib/validations/shared";
import { projectCreateSchema } from "@/lib/validations/project";
import { createDefaultTaskWorkflow } from "@/lib/task-workflows";

function isProjectStatus(value: string): value is ProjectStatus {
  return Object.values(ProjectStatus).some((status) => status === value);
}

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const { page, pageSize } = parsePage(params);
  const status = params.get("status");
  let statusFilter: ProjectStatus | undefined;
  if (status) {
    if (!isProjectStatus(status)) {
      return NextResponse.json({ error: "Choose a valid project status.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    statusFilter = status;
  }
  const search = params.get("search")?.trim().slice(0, 120);
  const where: Prisma.ProjectWhereInput = {
    organizationId: context.organizationId,
    ...(roleAtLeast(context.role, "ADMIN") ? {} : { members: { some: { memberId: context.memberId } } }),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [projects, total] = await Promise.all([
    db.project.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { milestones: true, tasks: true, allocations: true } },
      },
    }),
    db.project.count({ where }),
  ]);

  return NextResponse.json({ data: projects, meta: { total, page, pageSize } });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.CREATE, entityType: "project", status, error, code,
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    }
    throw error;
  }

  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "Check the project details.", "VALIDATION_ERROR");
  }
  const validation = await prepareMetadataValues(context.organizationId, "project", parsed.data.metadata ?? {});
  if (!validation.values) {
    return fail(422, validation.error ?? "Custom values are invalid.", "VALIDATION_ERROR");
  }
  const metadataValues: Prisma.InputJsonObject = validation.values;

  try {
    const result = await db.$transaction(async (tx) => {
      const workflow = parsed.data.workflowId
        ? await tx.taskWorkflow.findFirst({
            where: { id: parsed.data.workflowId, organizationId: context.organizationId },
            select: { id: true },
          })
        : await createDefaultTaskWorkflow(tx, context.organizationId);
      if (!workflow) return { kind: "workflow" as const };
      const created = await tx.project.create({
        data: {
          ...parsed.data,
          code: parsed.data.code.toUpperCase(),
          workflowId: workflow.id,
          metadata: metadataValues,
          organizationId: context.organizationId,
        },
      });
      await tx.projectMember.create({
        data: {
          organizationId: context.organizationId,
          projectId: created.id,
          memberId: context.memberId,
          role: "LEAD",
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.CREATE,
        entityType: "project",
        entityId: created.id,
        after: {
          id: created.id,
          organizationId: created.organizationId,
          code: created.code,
          title: created.title,
          status: created.status,
        },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return { kind: "created" as const, data: created };
    });

    if (result.kind === "workflow") {
      return fail(422, "Choose a workflow in this organization.", "VALIDATION_ERROR");
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(409, "A project with that code already exists.", "CONFLICT");
    }
    throw error;
  }
}
