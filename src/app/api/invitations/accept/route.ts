import { createHash } from "node:crypto";
import { AuditAction, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { inviteAcceptSchema } from "@/lib/validations/member";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }

  const parsed = inviteAcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const session = await auth();
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const invitation = await db.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      expiresAt: true,
      acceptedAt: true,
      organization: { select: { isActive: true } },
    },
  });
  if (!invitation || invitation.acceptedAt) {
    return NextResponse.json({ error: "This invitation is no longer available.", code: "INVITATION_INVALID" }, { status: 404 });
  }
  if (!invitation.organization.isActive) {
    return NextResponse.json({ error: "This organization is no longer active.", code: "INVITATION_INVALID" }, { status: 404 });
  }
  if (invitation.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This invitation has expired. Ask an administrator to send a new one.", code: "INVITATION_EXPIRED" }, { status: 410 });
  }

  let userId = session?.user?.id;
  let passwordHash: string | undefined;
  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json({ error: "Sign in with the email address that received this invitation.", code: "EMAIL_MISMATCH" }, { status: 403 });
    }
  } else {
    const existingUser = await db.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json({ error: "An account already exists for this email. Sign in, then accept the invitation.", code: "SIGN_IN_REQUIRED" }, { status: 409 });
    }
    if (!parsed.data.name || !parsed.data.password) {
      return NextResponse.json({ error: "Enter your name and choose a password to accept this invitation.", code: "REGISTRATION_REQUIRED" }, { status: 422 });
    }
    userId = undefined;
    passwordHash = await hash(parsed.data.password, 12);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const currentInvitation = await tx.invitation.findUnique({
        where: { id: invitation.id },
        select: {
          acceptedAt: true,
          expiresAt: true,
          organization: { select: { isActive: true } },
        },
      });
      if (!currentInvitation || currentInvitation.acceptedAt || currentInvitation.expiresAt <= new Date() || !currentInvitation.organization.isActive) {
        return { kind: "invalid" as const };
      }

      const accepted = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date(), pendingKey: null },
      });
      if (accepted.count !== 1) return { kind: "invalid" as const };

      const user = userId
        ? await tx.user.findUniqueOrThrow({ where: { id: userId } })
        : await tx.user.create({
            data: {
              email: invitation.email,
              name: parsed.data.name,
              passwordHash,
            },
          });

      const member = await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
          joinedAt: new Date(),
        },
      });

      await createAuditEvent({
        organizationId: invitation.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: AuditAction.CREATE,
        entityType: "organization_member",
        entityId: member.id,
        after: { id: member.id, userId: user.id, role: member.role },
        userAgent: request.headers.get("user-agent"),
      }, tx);

      return { kind: "accepted" as const, userId: user.id, email: user.email, organizationId: invitation.organizationId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "invalid") {
      return NextResponse.json({ error: "This invitation was already used or has expired.", code: "INVITATION_INVALID" }, { status: 409 });
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "This invitation was already accepted or the account already belongs to this organization.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
