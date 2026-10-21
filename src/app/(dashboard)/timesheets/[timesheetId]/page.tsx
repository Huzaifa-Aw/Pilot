import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TimesheetForm } from "@/components/forms/timesheet-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Timesheet details" };

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ timesheetId: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const { timesheetId } = await params;
  const entry = await db.timesheetEntry.findFirst({
    where: {
      id: timesheetId,
      organizationId: context.organizationId,
      ...(!roleAtLeast(context.role, "MANAGER") ? { memberId: context.memberId } : {}),
    },
    include: { project: { select: { id: true, code: true, title: true } } },
  });
  if (!entry) notFound();

  const canEdit = entry.memberId === context.memberId &&
    (entry.status === "DRAFT" || entry.status === "FLAGGED");
  const projects = canEdit ? await db.project.findMany({
    where: { organizationId: context.organizationId, status: { not: "ARCHIVED" } },
    select: { id: true, code: true, title: true },
    orderBy: { title: "asc" },
  }) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/timesheets" label="Timesheets" currentPage="Timesheet details" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-text-muted">{entry.project.code} · Week of {formatDate(entry.weekStartDate)}</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary">{entry.project.title}</h1>
        </div>
        <StatusBadge status={entry.status} />
      </header>
      {canEdit ? (
        <section className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
          <TimesheetForm
            entry={entry}
            projects={projects}
            initialWeek={entry.weekStartDate.toISOString().slice(0, 10)}
          />
        </section>
      ) : (
        <section className="rounded-lg border border-border-default bg-surface p-4 sm:p-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Monday", entry.monday],
              ["Tuesday", entry.tuesday],
              ["Wednesday", entry.wednesday],
              ["Thursday", entry.thursday],
              ["Friday", entry.friday],
            ].map(([label, hours]) => (
              <div key={label} className="rounded-md bg-neutral-50 p-3">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-text-primary">{hours} hrs</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-right text-sm font-semibold tabular-nums text-text-primary">Total: {entry.totalHrs} hrs</p>
          {entry.notes && <p className="mt-4 border-t border-border-default pt-4 text-sm leading-6 text-text-secondary">{entry.notes}</p>}
        </section>
      )}
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
