import { MemberRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type TenantContext = {
  organizationId: string;
  userId: string;
  memberId: string;
  role: MemberRole;
};

export async function resolveTenantContext(): Promise<TenantContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const organizationId = session?.user?.activeOrganizationId;

  if (!userId || !organizationId) return null;

  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
      isActive: true,
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      role: true,
      organization: { select: { isActive: true } },
    },
  });

  if (!membership || !membership.organization.isActive) return null;

  return {
    organizationId: membership.organizationId,
    userId: membership.userId,
    memberId: membership.id,
    role: membership.role,
  };
}
