import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { MemberInviteForm } from "@/components/forms/member-invite-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Member access" };

export default async function MemberSettingsPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "ADMIN")) redirect("/overview");

  const [members, invitations] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId },
      orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
      include: { user: { select: { name: true, email: true } } },
    }),
    db.invitation.findMany({
      where: {
        organizationId: context.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <BackLink href="/settings" label="Settings" currentPage="Member access" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization settings</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Member access</h1>
        <p className="mt-2 text-sm text-text-secondary">Invite teammates and manage roles in this organization.</p>
      </header>

      <section aria-labelledby="invite-title" className="space-y-4">
        <div>
          <h2 id="invite-title" className="font-heading text-lg font-semibold text-text-primary">Invite a member</h2>
          <p className="mt-1 text-sm text-text-muted">Invitations expire after seven days and can be used once.</p>
        </div>
        <MemberInviteForm canInviteOwner={roleAtLeast(context.role, "OWNER")} />
      </section>

      <section aria-labelledby="pending-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="pending-title" className="font-heading text-lg font-semibold text-text-primary">Pending invitations</h2>
            <p className="mt-1 text-sm text-text-muted">{invitations.length} awaiting acceptance</p>
          </div>
        </div>
        {invitations.length ? (
          <ul className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default bg-surface">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info-light text-brand-primary">
                    <Mail size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{invitation.email}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{invitation.role.toLowerCase()} · Expires {formatDate(invitation.expiresAt)}</p>
                  </div>
                </div>
                <StatusBadge status="UPCOMING" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-surface px-4 py-7 text-center text-sm text-text-muted">
            No pending invitations.
          </p>
        )}
      </section>

      <section aria-labelledby="members-title" className="space-y-3">
        <div>
          <h2 id="members-title" className="font-heading text-lg font-semibold text-text-primary">Organization members</h2>
          <p className="mt-1 text-sm text-text-muted">{members.length} total memberships</p>
        </div>
        <ul className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default bg-surface">
          {members.map((member) => (
            <li key={member.id} className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">{member.user.name ?? member.user.email}</p>
                <p className="mt-0.5 truncate text-xs text-text-muted">{member.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={member.role} showDot={false} />
                {!member.isActive && <StatusBadge status="INACTIVE" />}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
