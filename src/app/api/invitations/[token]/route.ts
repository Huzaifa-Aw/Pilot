import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await db.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      organization: { select: { name: true, isActive: true } },
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

  return NextResponse.json({
    data: {
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization.name,
      expiresAt: invitation.expiresAt,
    },
  });
}
