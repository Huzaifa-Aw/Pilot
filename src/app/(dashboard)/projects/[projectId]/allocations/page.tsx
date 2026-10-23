import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UsersRound } from "lucide-react";
import { AllocationCreateForm } from "@/components/forms/allocation-form";
import { AllocationControls } from "@/components/forms/allocation-controls";
import { BackLink } from "@/components/layout/BackLink";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";
import { roleAtLeast } from "@/lib/rbac";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { allocationsCsvTemplate } from "@/lib/csv-templates";

export const metadata: Metadata = { title: "Project allocations" };

function firstWeekMonday() {
  const today = new Date();
  const day = today.getUTCDay();
  const days = (8 - day) % 7;
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
}

export default async function ProjectAllocationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const { projectId } = await params;
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    select: { id: true, code: true, title: true },
  });
  if (!project) notFound();

  const firstWeek = firstWeekMonday();
  const lastWeek = new Date(firstWeek);
  lastWeek.setUTCDate(lastWeek.getUTCDate() + 11 * 7);
  const lastWeekEnd = new Date(lastWeek);
  lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() + 6);
  const [members, allocations] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, capacityHrsPerWeek: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.resourceAllocation.findMany({
      where: {
        organizationId: context.organizationId,
        projectId,
        weekStartDate: { gte: firstWeek, lte: lastWeek },
      },
      include: {
        member: {
          select: {
            id: true,
            capacityHrsPerWeek: true,
            user: { select: { name: true, email: true } },
          },
        },
        milestone: { select: { title: true } },
      },
      orderBy: [{ weekStartDate: "asc" }, { member: { user: { name: "asc" } } }],
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink href={`/projects/${project.id}`} label="Project details" currentPage="Allocations" />
      <header>
        <p className="font-mono text-xs text-text-muted">{project.code}</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Resource allocations</h1>
        <p className="mt-2 text-sm text-text-secondary">{project.title}</p>
      </header>

      {roleAtLeast(context.role, "MANAGER") && (
        <section aria-labelledby="new-allocation-title" className="space-y-3">
          <div>
            <h2 id="new-allocation-title" className="font-heading text-lg font-semibold text-text-primary">Assign weekly capacity</h2>
            <p className="mt-1 text-sm text-text-muted">A member cannot be allocated above 100% across projects in one week.</p>
          </div>
          <AllocationCreateForm
            projectId={project.id}
            members={members.map((member) => ({
              id: member.id,
              name: member.user.name ?? member.user.email,
              capacityHrsPerWeek: member.capacityHrsPerWeek,
            }))}
            startDate={firstWeek.toISOString().slice(0, 10)}
            endDate={lastWeekEnd.toISOString().slice(0, 10)}
          />
        </section>
      )}

      {roleAtLeast(context.role, "MANAGER") && (
        <CsvImportPanel
          title="Import allocations from CSV"
          endpoint="/api/allocations/import"
          template={allocationsCsvTemplate}
          help="Import weekly allocations across projects. The member, project, and Monday week form the update key; capacity rules apply."
        />
      )}

      <section aria-labelledby="allocation-list-title" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="allocation-list-title" className="font-heading text-lg font-semibold text-text-primary">Scheduled allocations</h2>
            <p className="mt-1 text-sm text-text-muted">Next 12 weeks.</p>
          </div>
          <span className="text-xs text-text-muted">{allocations.length} assignments</span>
        </div>
        {allocations.length ? (
          <ul className="space-y-3">
            {allocations.map((allocation) => (
              <li key={allocation.id} className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{allocation.member.user.name ?? allocation.member.user.email}</h3>
                      <StatusBadge status={allocation.allocationPct > 100 ? "OVERALLOCATED" : "ACTIVE"} />
                    </div>
                    <p className="mt-1 text-xs text-text-muted">Week of {formatDate(allocation.weekStartDate)} · {allocation.mode}</p>
                    {allocation.milestone && <p className="mt-1 text-xs text-text-secondary">Milestone: {allocation.milestone.title}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-lg font-semibold tabular-nums ${allocation.allocationPct > 100 ? "text-error-dark" : "text-text-primary"}`}>
                        {allocation.allocationPct}%
                      </p>
                      <p className="text-xs text-text-muted">{allocation.plannedHrs} hrs of {allocation.member.capacityHrsPerWeek}</p>
                    </div>
                    {roleAtLeast(context.role, "MANAGER") && (
                      <AllocationControls allocation={{
                        id: allocation.id,
                        memberId: allocation.memberId,
                        weekStartDate: allocation.weekStartDate,
                        plannedHrs: allocation.plannedHrs,
                        allocationPct: allocation.allocationPct,
                        mode: allocation.mode,
                        notes: allocation.notes,
                        capacityHrsPerWeek: allocation.member.capacityHrsPerWeek,
                      }} />
                    )}
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <progress aria-label={`${allocation.member.user.name ?? allocation.member.user.email} allocation`} className={`h-1.5 w-full ${allocation.allocationPct > 100 ? "accent-error" : "accent-brand-primary"}`} max={100} value={Math.min(100, allocation.allocationPct)} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-10 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-md bg-info-light text-brand-primary"><UsersRound size={20} aria-hidden="true" /></div>
            <h3 className="mt-3 text-sm font-semibold text-text-primary">No allocations scheduled</h3>
            <p className="mt-1 text-sm text-text-muted">Plan a member&apos;s weekly capacity for this project.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
