import { createHash, randomBytes } from "node:crypto";
import { AuditAction, MemberRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { emailConfigurationError, EmailDeliveryError, sendInvitationEmail } from "@/lib/email";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { inviteMemberSchema } from "@/lib/validations/member";

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ADMIN");
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
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  if (parsed.data.role === MemberRole.OWNER && !roleAtLeast(context.role, MemberRole.OWNER)) {
    return NextResponse.json({ error: "Only an owner can invite another owner.", code: "FORBIDDEN" }, { status: 403 });
  }

  const appUrl = process.env.AUTH_URL;
  const emailConfigError = emailConfigurationError();
  if (!appUrl || emailConfigError) {
    return NextResponse.json(
      { error: emailConfigError ?? "Set AUTH_URL to the public application URL before sending invitations.", code: "EMAIL_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const existingUser = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      memberships: {
        where: { organizationId: context.organizationId },
        select: { id: true, isActive: true },
        take: 1,
      },
    },
  });
  if (existingUser?.memberships.some((membership) => membership.isActive)) {
    return NextResponse.json({ error: "That person is already an active organization member.", code: "CONFLICT" }, { status: 409 });
  }
  if (existingUser?.memberships.length) {
    return NextResponse.json({ error: "That person already has an inactive membership. Reactivate it from the member profile.", code: "CONFLICT" }, { status: 409 });
  }

  const now = new Date();
  const pendingKey = createHash("sha256")
    .update(`${context.organizationId}:${parsed.data.email}`)
    .digest("hex");
  await db.invitation.updateMany({
    where: {
      organizationId: context.organizationId,
      email: parsed.data.email,
      acceptedAt: null,
      expiresAt: { lte: now },
    },
    data: { pendingKey: null },
  });
  const pending = await db.invitation.findFirst({
    where: {
      organizationId: context.organizationId,
      email: parsed.data.email,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json({ error: "A pending invitation already exists for that email.", code: "CONFLICT" }, { status: 409 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const organization = await db.organization.findUnique({
    where: { id: context.organizationId },
    select: { name: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Organization not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  let invitation;
  try {
    invitation = await db.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          organizationId: context.organizationId,
          email: parsed.data.email,
          role: parsed.data.role,
          tokenHash,
          pendingKey,
          expiresAt,
          invitedById: context.userId,
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.INVITE,
        entityType: "invitation",
        entityId: created.id,
        after: { id: created.id, email: created.email, role: created.role, expiresAt: expiresAt.toISOString() },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A pending invitation already exists for that email.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }

  try {
    const invitationUrl = new URL(`/invite/${token}`, appUrl).toString();
    await sendInvitationEmail({
      recipient: parsed.data.email,
      organizationName: organization.name,
      invitationUrl,
      expiresAt,
    });
  } catch (error) {
    await db.invitation.deleteMany({
      where: { id: invitation.id, organizationId: context.organizationId, acceptedAt: null },
    });
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json({ error: error.message, code: "EMAIL_DELIVERY_FAILED" }, { status: 502 });
    }
    throw error;
  }

  return NextResponse.json(
    { data: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt } },
    { status: 201 },
  );
}
