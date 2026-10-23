import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Clock3, MapPin, UserRound } from "lucide-react";
import { MemberProfileForm } from "@/components/forms/member-profile-form";
import { AllocationEditForm } from "@/components/forms/allocation-form";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetadataValuesDisplay } from "@/components/forms/metadata-fields-editor";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getDefaultMetadataFields, metadataValuesForFields, unconfiguredMetadataValues } from "@/lib/metadata";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Member profile" };

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "ENGINEER")) redirect("/overview");
  const { memberId } = await params;
  const [member, metadataFields] = await Promise.all([
    db.organizationMember.findFirst({
      where: { id: memberId, organizationId: context.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        reportsTo: { select: { id: true, user: { select: { name: true, email: true } } } },
        skillsProfile: { orderBy: { name: "asc" } },
        certifications: { orderBy: [{ expiresOn: "asc" }, { name: "asc" }] },
        deploymentMemberships: {
          where: {
            organizationId: context.organizationId,
            deployment: {
              status: { in: ["ACTIVE", "UPCOMING"] },
              startDate: { lte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") },
              endDate: { gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") },
            },
          },
          include: { deployment: { select: { status: true, startDate: true, endDate: true, location: true } } },
        },
        allocations: {
          where: { organizationId: context.organizationId },
          orderBy: { weekStartDate: "desc" },
          take: 12,
          include: { project: { select: { id: true, code: true, title: true } } },
        },
        _count: {
          select: { timesheetEntries: true, taskAssignments: true, deployments: true },
        },
      },
    }),
    getDefaultMetadataFields(context.organizationId, "member"),
  ]);
  if (!member) notFound();

  const canEdit = await can(context, "profile.update", { memberId: member.id }) ||
    await can(context, "profile.manage", { memberId: member.id });
  const canEditRole = roleAtLeast(context.role, "ADMIN");
  const editableAllocationIds = new Set<string>();
  for (const allocation of member.allocations) {
    if (await can(context, "allocation.update", { projectId: allocation.projectId, memberId: allocation.memberId })) {
      editableAllocationIds.add(allocation.id);
    }
  }
  const reportOptions = canEditRole
    ? await db.organizationMember.findMany({
        where: { organizationId: context.organizationId, isActive: true },
        select: { id: true, user: { select: { name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      })
    : [];
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const [monthWorklogs, weeklyAllocations, trendAllocations] = await Promise.all([
    db.worklog.findMany({
      where: { organizationId: context.organizationId, memberId: member.id, date: { gte: monthStart, lt: monthEnd } },
      select: { hours: true, project: { select: { title: true } } },
    }),
    db.resourceAllocation.findMany({
      where: { organizationId: context.organizationId, memberId: member.id, weekStartDate: weekStart },
      select: { plannedHrs: true },
    }),
    db.resourceAllocation.findMany({
      where: { organizationId: context.organizationId, memberId: member.id, weekStartDate: { gte: new Date(weekStart.getTime() - 77 * 86400000), lte: weekStart } },
      select: { weekStartDate: true, plannedHrs: true },
      orderBy: { weekStartDate: "asc" },
    }),
  ]);
  const loggedHours = monthWorklogs.reduce((sum, entry) => sum + entry.hours, 0);
  const expectedHours = expectedMonthlyHours(member.workingDays, member.dailyCapacityHrs, monthStart, monthEnd);
  const allocatedHours = weeklyAllocations.reduce((sum, item) => sum + item.plannedHrs, 0);
  const trend = new Map<string, number>();
  for (const allocation of trendAllocations) {
    const week = allocation.weekStartDate.toISOString().slice(0, 10);
    trend.set(week, (trend.get(week) ?? 0) + allocation.plannedHrs);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink href="/members" label="People" currentPage="Member profile" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-info-light text-brand-primary">
            <UserRound size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-text-primary">{member.user.name ?? member.user.email}</h1>
              <StatusBadge status={member.role} showDot={false} />
              {!member.isActive && <StatusBadge status="ARCHIVED" />}
              {member.deploymentMemberships.map(({ deployment }, index) => <OnDeploymentBadge key={`${deployment.location}-${index}`} status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} />)}
            </div>
            <p className="mt-1 break-all text-sm text-text-secondary">{member.user.email}</p>
            <p className="mt-1 text-sm text-text-muted">{member.title ?? "Title not set"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Summary icon={<BriefcaseBusiness size={16} />} label="Tasks" value={member._count.taskAssignments} />
          <Summary icon={<Clock3 size={16} />} label="Timesheets" value={member._count.timesheetEntries} />
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          <MetadataValuesDisplay
            fields={metadataFields}
            values={metadataValuesForFields(metadataFields, member.metadata ?? {})}
            unconfigured={unconfiguredMetadataValues(metadataFields, member.metadata ?? {})}
          />

      {member.certifications.length > 0 && (
        <section aria-labelledby="certifications-title" className="space-y-3">
          <div><h2 id="certifications-title" className="font-heading text-lg font-semibold text-text-primary">Certifications</h2><p className="mt-1 text-sm text-text-muted">Credentials and renewal dates recorded for this member.</p></div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {member.certifications.map((certification) => {
              const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
              const expiresSoon = certification.expiresOn && certification.expiresOn >= today && certification.expiresOn.getTime() <= today.getTime() + 60 * 86400000;
              const expired = certification.expiresOn && certification.expiresOn < today;
              return <li key={certification.id} className="rounded-lg border border-border-default bg-surface p-4">
                <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-text-primary">{certification.name}</h3>{expired ? <StatusBadge status="EXPIRED" /> : expiresSoon ? <StatusBadge status="EXPIRING_SOON" /> : <StatusBadge status="ACTIVE" />}</div>
                <p className="mt-1 text-sm text-text-muted">{certification.issuer ?? "Issuer not set"}</p>
                <p className="mt-2 text-xs text-text-secondary">{certification.expiresOn ? `Expires ${formatDate(certification.expiresOn)}` : "No expiry date"}{certification.credentialId ? ` · ${certification.credentialId}` : ""}</p>
              </li>;
            })}
          </ul>
        </section>
      )}

      {canEdit && (
        <section aria-labelledby="profile-title" className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
          <h2 id="profile-title" className="mb-4 font-heading text-lg font-semibold text-text-primary">Member profile</h2>
          <MemberProfileForm
            member={{
              ...member,
              emergencyContactName: canEditRole ? member.emergencyContactName : null,
              emergencyContactPhone: canEditRole ? member.emergencyContactPhone : null,
            }}
            canEditRole={canEditRole}
            reportsToOptions={reportOptions.map((option) => ({ id: option.id, name: option.user.name ?? option.user.email }))}
            metadataFields={metadataFields}
            initialMetadata={metadataValuesForFields(metadataFields, member.metadata ?? {})}
          />
        </section>
      )}

      <section aria-labelledby="allocation-title" className="space-y-3">
        <div>
          <h2 id="allocation-title" className="font-heading text-lg font-semibold text-text-primary">Recent allocations</h2>
          <p className="mt-1 text-sm text-text-muted">Weekly project assignments for this member.</p>
        </div>
        {member.allocations.length ? (
          <ul className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default bg-surface">
            {member.allocations.map((allocation) => (
              <li key={allocation.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <Link href={`/projects/${allocation.project.id}`} className="block truncate text-sm font-semibold text-brand-primary hover:underline">
                    {allocation.project.title}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-text-muted">{allocation.project.code} · Week of {formatDate(allocation.weekStartDate)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-sm text-text-secondary">
                  <span className="flex items-center gap-2"><MapPin size={15} aria-hidden="true" />{allocation.allocationPct}% · {allocation.plannedHrs} hrs</span>
                  {editableAllocationIds.has(allocation.id) && <details className="w-full"><summary className="min-h-11 cursor-pointer text-right text-xs font-semibold text-brand-primary">Change here</summary><AllocationEditForm allocation={{ id: allocation.id, memberId: allocation.memberId, weekStartDate: allocation.weekStartDate, plannedHrs: allocation.plannedHrs, allocationPct: allocation.allocationPct, mode: allocation.mode, notes: allocation.notes, capacityHrsPerWeek: member.capacityHrsPerWeek }} /></details>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-surface px-4 py-8 text-center text-sm text-text-muted">
            No allocations have been recorded for this member.
          </p>
        )}
      </section>
        </div>
        <aside aria-label="Member metrics" className="order-1 grid gap-3 sm:grid-cols-2 lg:sticky lg:top-4 lg:order-2 lg:grid-cols-1">
          <section aria-label="Weekly utilization" className="rounded-lg border border-border-default bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-text-primary">Weekly utilization</h2>
              <span className="text-xs tabular-nums text-text-secondary">{allocatedHours.toFixed(1)} / {member.capacityHrsPerWeek}h</span>
            </div>
            <progress aria-label="Weekly planned hours" className={`mt-2 h-1.5 w-full ${allocatedHours > member.capacityHrsPerWeek ? "accent-error" : "accent-brand-primary"}`} max={member.capacityHrsPerWeek || 1} value={Math.min(allocatedHours, member.capacityHrsPerWeek || 1)} />
            <div className="mt-2 flex h-7 items-end gap-1" aria-label="12-week allocation trend">
              {[...trend.entries()].slice(-12).map(([week, hours]) => <span key={week} title={`${week}: ${hours} hours`} className={`min-w-1 flex-1 rounded-t ${hours > member.capacityHrsPerWeek ? "bg-error-dark" : "bg-brand-primary"}`} style={{ height: `${Math.max(8, Math.min(100, hours / Math.max(member.capacityHrsPerWeek, 1) * 100))}%` }} />)}
            </div>
            <p className="mt-1 text-[11px] text-text-muted">Planned hours across the last 12 weeks</p>
          </section>
          <section aria-label="Monthly timesheet summary" className="rounded-lg border border-border-default bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-text-primary">This month</h2>
              <span className="text-[11px] text-text-muted">{new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(monthStart)}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums text-text-primary">{loggedHours.toFixed(1)}<span className="text-xs font-medium text-text-muted"> / {expectedHours.toFixed(1)}h</span></p>
            <p className="mt-1 text-xs text-text-secondary">{Math.max(0, expectedHours - loggedHours).toFixed(1)}h remaining · {monthWorklogs.length} entries</p>
            <Link href="/timesheets?tab=mine" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-brand-primary hover:underline">Open timesheet <ArrowRight className="ml-1" size={13} aria-hidden="true" /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-md border border-border-default bg-surface px-3 text-xs text-text-secondary">
      {icon}<span>{label}</span><span className="font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function expectedMonthlyHours(workingDays: number[], dailyHours: number, start: Date, end: Date) {
  let count = 0;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  for (const date = new Date(start); date < end && date <= today; date.setUTCDate(date.getUTCDate() + 1)) {
    if (workingDays.includes(date.getUTCDay())) count += 1;
  }
  return count * dailyHours;
}
