import type { Metadata } from "next";
import { ArrowRight, BriefcaseBusiness, CircleCheck, Clock3, UsersRound } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const context = await resolveTenantContext();
  if (!context) return null;
  const session = await auth();

  const [projectCount, activeProjects, memberCount, pendingTimesheets, completedProjects, recentProjects] = await Promise.all([
    db.project.count({ where: { organizationId: context.organizationId, status: { not: "ARCHIVED" } } }),
    db.project.count({ where: { organizationId: context.organizationId, status: "ACTIVE" } }),
    db.organizationMember.count({ where: { organizationId: context.organizationId, isActive: true } }),
    db.timesheetEntry.count({ where: { organizationId: context.organizationId, status: "SUBMITTED" } }),
    db.project.count({ where: { organizationId: context.organizationId, status: "COMPLETED" } }),
    db.project.findMany({
      where: { organizationId: context.organizationId, status: { not: "ARCHIVED" } },
      select: { id: true, code: true, title: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const stats = [
    { label: "Active projects", value: activeProjects, icon: BriefcaseBusiness, helper: `${projectCount} total projects` },
    { label: "Organization members", value: memberCount, icon: UsersRound, helper: "Active memberships" },
    { label: "Timesheets to review", value: pendingTimesheets, icon: Clock3, helper: "Submitted this period" },
    { label: "Completed projects", value: completedProjects, icon: CircleCheck, helper: "Ready for closeout" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization overview</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Good to see you, {session?.user?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">Here&apos;s a snapshot of your organization&apos;s work.</p>
        </div>
        <Link href="/projects/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary-600">
          Create project <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>

      <section aria-label="Organization summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, helper }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-info-light text-brand-primary">
                <Icon size={20} aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold tabular-nums tracking-tight text-text-primary">{value}</p>
            </div>
            <h2 className="mt-4 text-sm font-semibold text-text-primary">{label}</h2>
            <p className="mt-1 text-xs text-text-muted">{helper}</p>
          </Card>
        ))}
      </section>

      <section aria-labelledby="recent-projects-title" className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
        <Card>
          <div className="flex items-center justify-between gap-4 border-b border-border-default px-5 py-4 sm:px-6">
            <div>
              <h2 id="recent-projects-title" className="font-heading text-base font-semibold text-text-primary">Recent projects</h2>
              <p className="mt-1 text-sm text-text-muted">A quick view of work updated recently.</p>
            </div>
            <Link href="/projects" className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-brand-primary transition-colors duration-150 hover:bg-neutral-50">
              View all <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          {recentProjects.length ? (
            <ul className="divide-y divide-border-default">
              {recentProjects.map((project) => (
                <li key={project.id}>
                  <Link href={`/projects/${project.id}`} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors duration-150 hover:bg-neutral-50 sm:px-6">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text-primary">{project.title}</span>
                      <span className="mt-1 block font-mono text-xs text-text-muted">{project.code}</span>
                    </span>
                    <StatusBadge status={project.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-9 text-center sm:px-6">
              <div className="mx-auto flex size-11 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
                <BriefcaseBusiness size={20} aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-text-primary">No projects yet</h3>
              <p className="mt-1 text-sm text-text-muted">Create a project to organize your team&apos;s work.</p>
              <Link href="/projects/new" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-semibold text-brand-primary hover:bg-neutral-50">
                Create your first project
              </Link>
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Getting started</p>
          <h2 className="mt-2 font-heading text-lg font-semibold text-text-primary">Build your organization workspace</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Start with a project, invite teammates, and shape the details around how your team works.</p>
          <ul className="mt-5 space-y-3 text-sm text-text-secondary">
            {[
              ["Create a project", "/projects/new"],
              ["Invite your team", "/settings/members"],
              ["Set up custom fields", "/settings/metadata-templates"],
            ].map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border-default bg-surface px-3 transition-colors duration-150 hover:bg-neutral-50">
                  {label}<ArrowRight size={15} className="text-brand-primary" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
