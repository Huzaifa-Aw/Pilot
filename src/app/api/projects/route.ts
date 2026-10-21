import { AuditAction, Prisma, ProjectStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole, isUniqueViolation } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { parsePage } from "@/lib/validations/shared";
import { projectCreateSchema } from "@/lib/validations/project";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }

  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the project details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const validation = await prepareMetadataValues(context.organizationId, "project", parsed.data.metadata ?? {});
  if (!validation.values) {
    return NextResponse.json({ error: validation.error ?? "Custom values are invalid.", code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
  }
  const metadataValues: Prisma.InputJsonObject = validation.values;

  try {
    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          ...parsed.data,
          code: parsed.data.code.toUpperCase(),
          metadata: metadataValues,
          organizationId: context.organizationId,
        },
      });
      await tx.projectMember.create({
        data: {
          organizationId: context.organizationId,
          projectId: project.id,
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
      return created;
    });

    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A project with that code already exists.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
