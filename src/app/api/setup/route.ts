import { AuditAction, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditEvent } from "@/lib/audit";
import { setupSchema } from "@/lib/validations/setup";
import { createDefaultTaskWorkflow } from "@/lib/task-workflows";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function GET() {
  const state = await db.bootstrapState.findUnique({
    where: { id: "global" },
    select: { id: true },
  });

  return NextResponse.json({ configured: Boolean(state) });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted setup fields.", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existingState = await db.bootstrapState.findUnique({ where: { id: "global" } });
  if (existingState) {
    return NextResponse.json({ error: "Initial setup has already been completed." }, { status: 409 });
  }

  const input = parsed.data;
  const passwordHash = await hash(input.password, 12);
  const userAgent = request.headers.get("user-agent");

  try {
    const result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug: input.organizationSlug,
        },
      });
      await createDefaultTaskWorkflow(tx, organization.id);
      const user = await tx.user.create({
        data: {
          email: input.ownerEmail,
          name: input.ownerName,
          passwordHash,
        },
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
          joinedAt: new Date(),
        },
      });

      await tx.bootstrapState.create({
        data: { id: "global", organizationId: organization.id },
      });

      await Promise.all([
        createAuditEvent({
          organizationId: organization.id,
          actorId: user.id,
          actorEmail: user.email,
          action: AuditAction.CREATE,
          entityType: "organization",
          entityId: organization.id,
          after: { id: organization.id, name: organization.name, slug: organization.slug },
          userAgent,
        }, tx),
        createAuditEvent({
          organizationId: organization.id,
          actorId: user.id,
          actorEmail: user.email,
          action: AuditAction.CREATE,
          entityType: "organization_member",
          entityId: member.id,
          after: { id: member.id, role: member.role, userId: user.id },
          userAgent,
        }, tx),
      ]);

      return { organizationId: organization.id, userId: user.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Setup could not be completed because the organization or owner already exists." },
        { status: 409 },
      );
    }
    throw error;
  }
}
