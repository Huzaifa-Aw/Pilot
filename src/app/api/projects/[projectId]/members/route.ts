import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditEvent } from "@/lib/audit";
import { requireCapability } from "@/lib/api";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ projectId: string }> };
const schema = z.object({
  members: z.array(z.object({
    memberId: z.string().uuid(),
    role: z.enum(["LEAD", "MEMBER"]),
  })).min(1).max(500),
}).refine(({ members }) => new Set(members.map(({ memberId }) => memberId)).size === members.length, {
  message: "A person can appear only once.",
});

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params;
  const { context, response } = await requireCapability("project.read", { projectId });
  if (response) return response;
  const [project, members] = await Promise.all([
    db.project.findFirst({ where: { id: projectId, organizationId: context.organizationId }, select: { id: true } }),
    db.projectMember.findMany({
      where: { organizationId: context.organizationId, projectId },
      include: { member: { include: { user: { select: { id: true, name: true, email: true } } } } },
      orderBy: [{ role: "asc" }, { member: { user: { name: "asc" } } }],
    }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: members });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params;
  const { context, response } = await requireCapability("project.members.manage", { projectId });
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    throw error;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Add project members and assign at least one project lead.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  if (!parsed.data.members.some(({ role }) => role === "LEAD")) {
    return NextResponse.json({ error: "Every project must have at least one lead.", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!project) return { kind: "missing" as const };
    const ids = parsed.data.members.map(({ memberId }) => memberId);
    const validMembers = await tx.organizationMember.findMany({
      where: { id: { in: ids }, organizationId: context.organizationId, isActive: true },
      select: { id: true },
    });
    if (validMembers.length !== ids.length) return { kind: "invalid-member" as const };

    const before = await tx.projectMember.findMany({
      where: { organizationId: context.organizationId, projectId },
      select: { memberId: true, role: true },
    });
    const beforeById = new Map(before.map((item) => [item.memberId, item.role]));
    const nextById = new Map(parsed.data.members.map((item) => [item.memberId, item.role]));
    await tx.projectMember.deleteMany({ where: { organizationId: context.organizationId, projectId } });
    await tx.projectMember.createMany({
      data: parsed.data.members.map((member) => ({ organizationId: context.organizationId, projectId, ...member })),
    });
    for (const [memberId, role] of nextById) {
      const previous = beforeById.get(memberId);
      if (previous === role) continue;
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: previous ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: "project_member",
        entityId: `${projectId}:${memberId}`,
        before: previous ? { projectId, memberId, role: previous } : null,
        after: { projectId, memberId, role },
        userAgent: request.headers.get("user-agent"),
      }, tx);
    }
    for (const [memberId, role] of beforeById) {
      if (nextById.has(memberId)) continue;
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.DELETE,
        entityType: "project_member",
        entityId: `${projectId}:${memberId}`,
        before: { projectId, memberId, role },
        after: null,
        userAgent: request.headers.get("user-agent"),
      }, tx);
    }
    return { kind: "updated" as const };
  });
  if (result.kind === "missing") return NextResponse.json({ error: "Project not found.", code: "NOT_FOUND" }, { status: 404 });
  if (result.kind === "invalid-member") return NextResponse.json({ error: "Choose only active members in this organization.", code: "VALIDATION_ERROR" }, { status: 422 });
  return NextResponse.json({ data: { projectId } });
}
