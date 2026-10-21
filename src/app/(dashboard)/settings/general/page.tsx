import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/layout/BackLink";
import { OrganizationDeleteButton } from "@/components/forms/organization-delete-button";
import { OwnershipTransferForm } from "@/components/forms/ownership-transfer-form";
import { OrganizationSettingsForm } from "@/components/forms/organization-settings-form";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Organization profile" };

export default async function OrganizationGeneralPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "ADMIN")) redirect("/overview");
  const [organization, otherMembers] = await Promise.all([
    db.organization.findUnique({
      where: { id: context.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        industry: true,
        logoUrl: true,
        website: true,
        timezone: true,
        locale: true,
      },
    }),
    roleAtLeast(context.role, "OWNER")
      ? db.organizationMember.findMany({
          where: { organizationId: context.organizationId, isActive: true, id: { not: context.memberId } },
          select: { id: true, user: { select: { name: true, email: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
  ]);
  if (!organization) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/settings" label="Settings" currentPage="Organization profile" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization settings</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Organization profile</h1>
        <p className="mt-2 text-sm text-text-secondary">These details identify and localize your organization workspace.</p>
      </header>
      <Card className="p-4 sm:p-6">
        <OrganizationSettingsForm
          organizationId={organization.id}
          initial={{
            name: organization.name,
            slug: organization.slug,
            industry: organization.industry,
            logoUrl: organization.logoUrl,
            website: organization.website,
            timezone: organization.timezone,
            locale: organization.locale,
          }}
        />
      </Card>
      {roleAtLeast(context.role, "OWNER") && (
        <>
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-text-primary">Transfer ownership</h2>
            <p className="mt-1 text-sm leading-5 text-text-muted">Give another active member full organization control.</p>
            <div className="mt-4">
              <OwnershipTransferForm
                organizationId={organization.id}
                members={otherMembers.map((member) => ({ id: member.id, name: member.user.name ?? member.user.email }))}
              />
            </div>
          </Card>
          <Card className="border-error-light p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-text-primary">Deactivate organization</h2>
            <p className="mt-1 text-sm leading-5 text-text-muted">Members will lose access; records and audit history will remain stored for retention.</p>
            <div className="mt-4"><OrganizationDeleteButton organizationId={organization.id} organizationName={organization.name} /></div>
          </Card>
        </>
      )}
    </div>
  );
}
