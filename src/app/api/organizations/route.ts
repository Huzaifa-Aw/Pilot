import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { organizationCreateSchema } from "@/lib/validations/organization";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to view your organizations." }, { status: 401 });
  }

  const memberships = await db.organizationMember.findMany({
    where: { userId: session.user.id, isActive: true, organization: { isActive: true } },
    select: {
      id: true,
      role: true,
      organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
    },
    orderBy: { organization: { name: "asc" } },
  });

  return NextResponse.json({ data: memberships });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before creating an organization." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  const parsed = organizationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the organization name and URL.", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const data = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: parsed.data,
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: session.user.id,
          role: "OWNER",
          joinedAt: new Date(),
        },
      });

      await createAuditEvent({
        organizationId: organization.id,
        actorId: session.user.id,
        actorEmail: session.user.email,
        action: AuditAction.CREATE,
        entityType: "organization_member",
        entityId: member.id,
        after: { id: member.id, role: member.role, userId: session.user.id },
        userAgent: request.headers.get("user-agent"),
      }, tx);

      return { organizationId: organization.id, slug: organization.slug };
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That organization URL is already in use." }, { status: 409 });
    }
    throw error;
  }
}
