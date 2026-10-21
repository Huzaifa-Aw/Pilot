import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TimesheetForm } from "@/components/forms/timesheet-form";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Log hours" };

function currentMonday() {
  const today = new Date();
  const day = today.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysSinceMonday));
}

export default async function NewTimesheetPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const projects = await db.project.findMany({
    where: { organizationId: context.organizationId, status: { not: "ARCHIVED" } },
    select: { id: true, code: true, title: true },
    orderBy: { title: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/timesheets" label="Timesheets" currentPage="New timesheet" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Weekly time capture</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Log project hours</h1>
        <p className="mt-2 text-sm text-text-secondary">Enter time in hours for each weekday. The weekly total is calculated automatically.</p>
      </header>
      {projects.length ? (
        <section className="rounded-lg border border-border-default bg-surface p-4 shadow-sm sm:p-6">
          <TimesheetForm projects={projects} initialWeek={currentMonday().toISOString().slice(0, 10)} />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-10 text-center">
          <h2 className="text-sm font-semibold text-text-primary">Create a project first</h2>
          <p className="mt-2 text-sm text-text-muted">Timesheet entries are connected to an organization project.</p>
          <Link href="/projects/new" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-brand-primary px-4 text-sm font-semibold text-white">Create project</Link>
        </div>
      )}
    </div>
  );
}
