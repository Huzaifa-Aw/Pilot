import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/layout/dashboard-frame";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const context = await resolveTenantContext();
  if (!context) redirect("/organizations/new");

  const [organization, memberships] = await Promise.all([
    db.organization.findUnique({
      where: { id: context.organizationId },
      select: { id: true, name: true },
    }),
    db.organizationMember.findMany({
      where: { userId: context.userId, isActive: true },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { organization: { name: "asc" } },
    }),
  ]);
  if (!organization) redirect("/organizations/new");

  return (
    <DashboardFrame
      activeOrganizationId={context.organizationId}
      organizationName={organization.name}
      organizations={memberships.map((membership) => ({
        ...membership.organization,
        role: membership.role,
      }))}
      role={context.role}
      userName={session.user.name ?? session.user.email ?? "Member"}
    >
      {children}
    </DashboardFrame>
  );
}
