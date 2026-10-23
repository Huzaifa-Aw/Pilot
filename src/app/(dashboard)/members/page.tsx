import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Search, UsersRound } from "lucide-react";
import type { DeploymentStatus } from "@prisma/client";
import { AllocationEditForm } from "@/components/forms/allocation-form";
import { CapacityHeatmap } from "@/components/data-display/capacity-heatmap";
import { CompactFilters } from "@/components/data-display/compact-filters";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { can, reportTree } from "@/lib/permissions";
import { resolveTenantContext } from "@/lib/tenant";
import { roleAtLeast } from "@/lib/rbac";
import { MEMBER_ROLES } from "@/lib/constants";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { metadataCsvHeaders } from "@/lib/metadata-csv";
import { serializeCsvRow } from "@/lib/csv";
import { allocationsCsvTemplate } from "@/lib/csv-templates";

export const metadata: Metadata = { title: "People" };

function currentMonday() {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ((today.getUTCDay() + 6) % 7)));
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; active?: string; tab?: string; role?: string; discipline?: string; manager?: string; availability?: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const search = params.search?.trim().slice(0, 100) ?? "";
  const activeOnly = params.active !== "false";
  const allocationsTab = params.tab === "allocations" && roleAtLeast(context.role, "MANAGER");
  const selectedRole = MEMBER_ROLES.find((role) => role === params.role);
  const selectedDiscipline = params.discipline?.trim().slice(0, 100);
  const managerId = params.manager?.trim();
  const availability = ["available", "overallocated"].includes(params.availability ?? "") ? params.availability : "";
  const allocationScopeIds = roleAtLeast(context.role, "ADMIN")
    ? (await db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true }, select: { id: true } })).map(({ id }) => id)
    : roleAtLeast(context.role, "MANAGER")
      ? await reportTree(context)
      : [context.memberId];
  let availabilityMemberIds: string[] | undefined;
  if (availability && roleAtLeast(context.role, "ENGINEER")) {
    const currentWeek = currentMonday();
    const totals = await db.resourceAllocation.groupBy({
      by: ["memberId"],
      where: { organizationId: context.organizationId, memberId: { in: allocationScopeIds }, weekStartDate: currentWeek },
      _sum: { allocationPct: true },
    });
    const totalByMember = new Map(totals.map((item) => [item.memberId, item._sum.allocationPct ?? 0]));
    availabilityMemberIds = allocationScopeIds.filter((id) => availability === "available" ? (totalByMember.get(id) ?? 0) < 100 : (totalByMember.get(id) ?? 0) > 100);
  }
  const where = {
    organizationId: context.organizationId,
    ...(activeOnly ? { isActive: true } : {}),
    ...(selectedRole ? { role: selectedRole } : {}),
    ...(selectedDiscipline ? { discipline: { equals: selectedDiscipline, mode: "insensitive" as const } } : {}),
    ...(managerId ? { reportsToMemberId: managerId } : {}),
    ...(availabilityMemberIds ? { id: { in: availabilityMemberIds } } : {}),
    ...(search ? {
      OR: [
        { user: { name: { contains: search, mode: "insensitive" as const } } },
        ...(roleAtLeast(context.role, "ENGINEER") ? [
          { user: { email: { contains: search, mode: "insensitive" as const } } },
          { discipline: { contains: search, mode: "insensitive" as const } },
          { title: { contains: search, mode: "insensitive" as const } },
          { skillsProfile: { some: { name: { contains: search, mode: "insensitive" as const } } } },
        ] : []),
      ],
    } : {}),
  };

  const [members, count] = await Promise.all([
    db.organizationMember.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
      include: { user: { select: { name: true, email: true, image: true } } },
    }),
    db.organizationMember.count({ where }),
  ]);
  const [disciplineRows, managerOptions] = roleAtLeast(context.role, "ENGINEER")
    ? await Promise.all([
        db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true, discipline: { not: null } }, select: { discipline: true }, distinct: ["discipline"], orderBy: { discipline: "asc" } }),
        db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true }, select: { id: true, user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
      ])
    : [[], []];
  const customHeaders = [...metadataCsvHeaders(await getDefaultMetadataFields(context.organizationId, "member")).keys()];
  const memberTemplate = [
    serializeCsvRow(["email", "title", "discipline", "department", "phone", "location", "capacityHrsPerWeek", "dailyCapacityHrs", "timezone", ...customHeaders]),
    serializeCsvRow(["member@example.test", "Project lead", "Software", "Delivery", "+1 555 0100", "Remote", "40", "8", "UTC", ...customHeaders.map(() => "")]),
  ].join("\n");
  const activeFilters = [
    { key: "search", label: "Search", value: search },
    { key: "active", label: "People", value: params.active ? (activeOnly ? "Active" : "All") : "" },
    { key: "role", label: "Role", value: selectedRole ?? "" },
    { key: "discipline", label: "Discipline", value: selectedDiscipline ?? "" },
    { key: "manager", label: "Manager", value: managerOptions.find(({ id }) => id === managerId)?.user.name ?? managerOptions.find(({ id }) => id === managerId)?.user.email ?? "" },
    { key: "availability", label: "Capacity", value: availability === "available" ? "Under capacity" : availability === "overallocated" ? "Overallocated" : "" },
  ];
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const deployments = await db.deployment.findMany({
    where: { organizationId: context.organizationId, status: { in: ["ACTIVE", "UPCOMING"] }, startDate: { lte: today }, endDate: { gte: today } },
    include: { members: { where: { organizationId: context.organizationId }, select: { memberId: true } } },
  });
  const deploymentByMember = new Map<string, (typeof deployments)[number]>();
  for (const deployment of deployments) {
    const memberIds = deployment.members.length ? deployment.members.map(({ memberId }) => memberId) : [deployment.memberId];
    for (const memberId of memberIds) deploymentByMember.set(memberId, deployment);
  }
  const weekStart = currentMonday();
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const week = new Date(weekStart);
    week.setUTCDate(week.getUTCDate() + index * 7);
    return week.toISOString().slice(0, 10);
  });
  const lastWeek = new Date(weekStart);
  lastWeek.setUTCDate(lastWeek.getUTCDate() + 11 * 7);

  if (allocationsTab) {
    const scopeIds = roleAtLeast(context.role, "ADMIN")
      ? members.map(({ id }) => id)
      : await reportTree(context);
    const [allocations] = await Promise.all([
      db.resourceAllocation.findMany({
        where: {
          organizationId: context.organizationId,
          memberId: { in: scopeIds },
          weekStartDate: { gte: weekStart, lte: lastWeek },
        },
        include: {
          member: { select: { id: true, capacityHrsPerWeek: true, user: { select: { name: true, email: true } } } },
          project: { select: { id: true, code: true, title: true } },
        },
        orderBy: [{ weekStartDate: "asc" }, { member: { user: { name: "asc" } } }],
      }),
    ]);
    const editable = new Set<string>();
    for (const allocation of allocations) {
      if (await can(context, "allocation.update", { projectId: allocation.projectId, memberId: allocation.memberId })) editable.add(allocation.id);
    }
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Your organization</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">People & allocations</h1>
          <p className="mt-2 text-sm text-text-secondary">Review weekly capacity and change a project allocation from the same screen.</p>
        </header>
        <PeopleTabs tab="allocations" />
        <section className="space-y-3" aria-labelledby="allocation-list-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="allocation-list-title" className="font-heading text-lg font-semibold text-text-primary">Next 12 weeks</h2>
            <div className="ml-auto">
              <CsvImportPanel
                title="Import allocations from CSV"
                endpoint="/api/allocations/import"
                template={allocationsCsvTemplate}
                help="Upsert one weekly allocation per member, project, and Monday. The weekly 100% capacity guard applies to every row."
              />
            </div>
          </div>
          {allocations.length ? <ul className="space-y-3">{allocations.map((allocation) => (
            <li key={allocation.id} className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{allocation.member.user.name ?? allocation.member.user.email}</p>
                  <Link href={`/projects/${allocation.projectId}`} className="mt-1 block text-sm font-medium text-brand-primary hover:underline">{allocation.project.code} · {allocation.project.title}</Link>
                  <p className="mt-1 text-xs text-text-muted">Week of {formatDate(allocation.weekStartDate)}</p>
                </div>
                <div className="text-right"><p className="text-lg font-semibold tabular-nums text-text-primary">{allocation.allocationPct}%</p><p className="text-xs text-text-muted">{allocation.plannedHrs} / {allocation.member.capacityHrsPerWeek}h</p></div>
              </div>
              {editable.has(allocation.id) ? (
                <details className="mt-2"><summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-brand-primary">Edit this allocation</summary><div className="mt-2 rounded-md bg-neutral-50 p-3"><AllocationEditForm allocation={{ id: allocation.id, memberId: allocation.memberId, weekStartDate: allocation.weekStartDate, plannedHrs: allocation.plannedHrs, allocationPct: allocation.allocationPct, mode: allocation.mode, notes: allocation.notes, capacityHrsPerWeek: allocation.member.capacityHrsPerWeek }} /></div></details>
              ) : <p className="mt-2 text-xs text-text-muted">Read-only outside your project and team scope.</p>}
            </li>
          ))}</ul> : <p className="rounded-lg border border-dashed border-neutral-300 bg-surface p-8 text-center text-sm text-text-muted">No allocations are scheduled for the next 12 weeks.</p>}
        </section>
      </div>
    );
  }

  const visibleMemberIds = roleAtLeast(context.role, "ADMIN")
    ? members.map(({ id }) => id)
    : roleAtLeast(context.role, "MANAGER")
      ? await reportTree(context)
      : [context.memberId];
  const capacityMembers = members.filter(({ id }) => visibleMemberIds.includes(id));
  const allocations = await db.resourceAllocation.findMany({
    where: {
      organizationId: context.organizationId,
      weekStartDate: { gte: weekStart, lte: lastWeek },
      memberId: { in: capacityMembers.map((member) => member.id) },
    },
    select: { memberId: true, weekStartDate: true, allocationPct: true },
  });
  const grid: Record<string, Record<string, number>> = {};
  for (const allocation of allocations) {
    const week = allocation.weekStartDate.toISOString().slice(0, 10);
    grid[allocation.memberId] ??= {};
    grid[allocation.memberId][week] = (grid[allocation.memberId][week] ?? 0) + allocation.allocationPct;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Your organization</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-text-secondary">{count} people · directory information is role-scoped.</p>
        </div>
        {roleAtLeast(context.role, "ADMIN") && (
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <CsvImportPanel
              title="Update people from CSV"
              endpoint="/api/members/import"
              template={memberTemplate}
              help="This updates existing organization members by email only. To add new people, use the invitation workflow. Blank optional cells keep current values."
            />
            <Link href="/settings/members" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary-600">Invite people <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        )}
      </header>
      {roleAtLeast(context.role, "MANAGER") && <PeopleTabs tab="directory" />}
      {capacityMembers.length > 0 && roleAtLeast(context.role, "ENGINEER") && (
        <CapacityHeatmap members={capacityMembers.map((member) => ({ id: member.id, name: member.user.name ?? member.user.email, title: member.title }))} weeks={weeks} allocations={grid} />
      )}
      <section aria-labelledby="directory-title" className="space-y-4">
        <div>
          <h2 id="directory-title" className="font-heading text-lg font-semibold text-text-primary">Directory</h2>
          <p className="mt-1 text-sm text-text-muted">{count} {count === 1 ? "person" : "people"}</p>
        </div>
        <CompactFilters
          pathname="/members"
          params={params}
          fieldNames={["search", "active", "role", "discipline", "manager", "availability"]}
          filters={activeFilters}
          preserveOnClear={["tab"]}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="relative"><span className="sr-only">Search people</span><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input name="search" defaultValue={search} placeholder={roleAtLeast(context.role, "ENGINEER") ? "Search name, email, title, or discipline" : "Search names"} className="min-h-11 w-full rounded-md border border-border-default bg-surface pl-9 pr-3 text-sm" /></label>
          <label><span className="sr-only">Person status</span><select name="active" defaultValue={activeOnly ? "true" : "false"} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="true">Active people</option><option value="false">All people</option></select></label>
          {roleAtLeast(context.role, "ENGINEER") && <>
            <label><span className="sr-only">Filter by role</span><select name="role" defaultValue={selectedRole ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All roles</option>{MEMBER_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>
            <label><span className="sr-only">Filter by discipline</span><select name="discipline" defaultValue={selectedDiscipline ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All disciplines</option>{disciplineRows.flatMap(({ discipline }) => discipline ? [<option key={discipline}>{discipline}</option>] : [])}</select></label>
            <label><span className="sr-only">Filter by manager</span><select name="manager" defaultValue={managerId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All teams</option>{managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.user.name ?? manager.user.email}</option>)}</select></label>
            <label><span className="sr-only">Filter by availability</span><select name="availability" defaultValue={availability} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">Any capacity</option><option value="available">Under capacity</option><option value="overallocated">Overallocated</option></select></label>
          </>}
          </div>
        </CompactFilters>
        {members.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{members.map((member) => (
          <li key={member.id}>
            {roleAtLeast(context.role, "ENGINEER") ? (
              <Link href={`/members/${member.id}`} className="block min-h-36 rounded-lg border border-border-default bg-surface p-4 transition-colors duration-150 hover:bg-neutral-50">
                <MemberCard member={member} showDetails deployment={deploymentByMember.get(member.id)} />
              </Link>
            ) : <div className="min-h-24 rounded-lg border border-border-default bg-surface p-4"><MemberCard member={member} showDetails={false} deployment={deploymentByMember.get(member.id)} /></div>}
          </li>
        ))}</ul> : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-10 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-md bg-info-light text-brand-primary"><UsersRound size={20} aria-hidden="true" /></div>
            <h3 className="mt-3 text-sm font-semibold text-text-primary">{search ? "No people match that search" : "No people found"}</h3>
            <p className="mt-1 text-sm text-text-muted">{search ? "Try a different name or clear the search." : "Invite teammates to start planning work together."}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function MemberCard({ member, showDetails, deployment }: { member: { id: string; role: string; title: string | null; discipline: string | null; isActive: boolean; user: { name: string | null; email: string } }; showDetails: boolean; deployment?: { status: DeploymentStatus; startDate: Date; endDate: Date; location: string } }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-text-primary">{member.user.name ?? (showDetails ? member.user.email : "Member")}</h3>{showDetails && <p className="mt-1 truncate text-xs text-text-muted">{member.user.email}</p>}</div>{showDetails && <StatusBadge status={member.isActive ? "ACTIVE" : "INACTIVE"} />}</div>
      {deployment && <div className="mt-2"><OnDeploymentBadge status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} /></div>}
      {showDetails && <><p className="mt-3 text-sm text-text-secondary">{member.title ?? "Title not set"}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-text-muted">{member.discipline ?? "Discipline not set"} · {member.role.toLowerCase()}</span><ArrowRight size={15} className="text-brand-primary" aria-hidden="true" /></div></>}
    </>
  );
}

function PeopleTabs({ tab }: { tab: "directory" | "allocations" }) {
  return <nav aria-label="People sections" className="flex gap-2 border-b border-border-default"><Link href="/members" aria-current={tab === "directory" ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${tab === "directory" ? "border-brand-primary text-brand-primary" : "border-transparent text-text-muted"}`}>Directory</Link><Link href="/members?tab=allocations" aria-current={tab === "allocations" ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${tab === "allocations" ? "border-brand-primary text-brand-primary" : "border-transparent text-text-muted"}`}>Allocations</Link></nav>;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
