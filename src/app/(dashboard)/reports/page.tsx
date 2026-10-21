import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { TaskStatus } from "@prisma/client";
import { BackLink } from "@/components/layout/BackLink";
import { ProjectHoursChart, ProjectTaskChart, TaskStatusChart, ThroughputChart } from "@/components/data-display/report-charts";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { reportTree } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; range?: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "MANAGER")) notFound();
  const params = await searchParams;
  const rangeMonths = params.range === "3" || params.range === "12" ? Number(params.range) : 6;
  const scopeMemberIds = roleAtLeast(context.role, "ADMIN")
    ? (await db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true }, select: { id: true } })).map(({ id }) => id)
    : await reportTree(context);
  const projects = await db.project.findMany({
    where: {
      organizationId: context.organizationId,
      ...(roleAtLeast(context.role, "ADMIN") ? {} : { members: { some: { memberId: { in: scopeMemberIds } } } }),
      ...(params.project ? { id: params.project } : {}),
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      milestones: { select: { id: true, title: true, status: true, startDate: true, targetDate: true, completionPct: true } },
      tasks: { select: { id: true, title: true, status: true, startDate: true, dueDate: true, priority: true, estimatedHrs: true, actualHrs: true, createdAt: true, completedAt: true, blockedByTaskId: true, blocker: { select: { title: true, taskNumber: true } }, updatedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const projectIds = projects.map(({ id }) => id);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - rangeMonths + 1, 1));
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const [worklogTotals, allocations, deployments, assetCount] = await Promise.all([
    db.worklog.aggregate({
      where: {
        organizationId: context.organizationId,
        memberId: { in: scopeMemberIds },
        date: { gte: monthStart, lte: today },
        ...(params.project ? { projectId: params.project } : {}),
      },
      _sum: { hours: true },
    }),
    db.resourceAllocation.findMany({
      where: {
        organizationId: context.organizationId,
        memberId: { in: scopeMemberIds },
        projectId: { in: projectIds },
        weekStartDate: { gte: monthStart, lte: today },
      },
      select: { memberId: true, plannedHrs: true, weekStartDate: true },
    }),
    db.deployment.findMany({
      where: {
        organizationId: context.organizationId,
        projectId: { in: projectIds },
        status: { in: ["UPCOMING", "ACTIVE"] },
      },
      select: { id: true, memberId: true, projectId: true, location: true, startDate: true, endDate: true, status: true },
      orderBy: { startDate: "asc" },
    }),
    db.asset.count({
      where: {
        organizationId: context.organizationId,
        ...(roleAtLeast(context.role, "ADMIN") ? {} : { projects: { some: { organizationId: context.organizationId, projectId: { in: projectIds } } } }),
      },
    }),
  ]);
  const tasks = projects.flatMap((project) => project.tasks.map((task) => ({ ...task, projectId: project.id, projectCode: project.code, projectTitle: project.title })));
  const allStatus = Object.values(TaskStatus);
  const statusCounts = new Map(allStatus.map((status) => [status, 0]));
  for (const task of tasks) statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
  const statusData = [...statusCounts].map(([status, count]) => ({ status, count }));
  const projectData = projects.map((project) => ({
    project: project.code,
    tasks: project.tasks.length,
    overdue: project.tasks.filter((task) => task.dueDate && task.dueDate < today && !["COMPLETED", "CANCELLED"].includes(task.status)).length,
    estimated: project.tasks.reduce((sum, task) => sum + (task.estimatedHrs ?? 0), 0),
    actual: project.tasks.reduce((sum, task) => sum + task.actualHrs, 0),
  }));
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
  const overdueTasks = projectData.reduce((sum, item) => sum + item.overdue, 0);
  const totalAllocated = allocations.reduce((sum, item) => sum + item.plannedHrs, 0);
  const totalLogged = worklogTotals._sum.hours ?? 0;
  const cycleTimes = tasks.filter((task) => task.completedAt && task.completedAt >= monthStart).map((task) => (task.completedAt!.getTime() - task.createdAt.getTime()) / 86400000);
  const averageCycleTime = cycleTimes.length ? cycleTimes.reduce((sum, days) => sum + days, 0) / cycleTimes.length : null;
  const thisWeek = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ((today.getUTCDay() + 6) % 7)));
  const throughput = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(thisWeek);
    start.setUTCDate(start.getUTCDate() - (11 - index) * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return {
      week: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(start),
      completed: tasks.filter((task) => task.completedAt && task.completedAt >= start && task.completedAt < end).length,
    };
  });
  const ganttStart = monthStart;
  const ganttEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + rangeMonths, 1));

  return (
    <div className="space-y-6">
      <BackLink href="/overview" label="Overview" currentPage="Reports" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Management insights</p><h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Reports</h1><p className="mt-2 text-sm text-text-secondary">Portfolio health, task flow, team capacity, and logged time.</p></div>
        <form className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="report-project">Project</label>
          <select id="report-project" name="project" defaultValue={params.project ?? ""} className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All scoped projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}</select>
          <label className="sr-only" htmlFor="report-range">Time range</label>
          <select id="report-range" name="range" defaultValue={String(rangeMonths)} className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-sm"><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select>
          <button className="min-h-11 rounded-md border border-border-default px-3 text-sm font-semibold">Apply</button>
        </form>
      </header>

      <section aria-label="Portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric title="Projects in scope" value={String(projects.length)} note="Active and archived history" />
        <Metric title="Tasks" value={String(totalTasks)} note={`${completedTasks} completed`} />
        <Metric title="Overdue tasks" value={String(overdueTasks)} note="Not completed or cancelled" />
        <Metric title="Planned allocation" value={`${totalAllocated.toFixed(0)}h`} note={`${rangeMonths}-month range`} />
        <Metric title="Time logged" value={`${totalLogged.toFixed(1)}h`} note={`${assetCount} registered assets`} />
        <Metric title="Average cycle time" value={averageCycleTime === null ? "—" : `${averageCycleTime.toFixed(1)} days`} note="Completed tasks only" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TaskStatusChart data={statusData} />
        <ProjectTaskChart data={projectData} />
        <ProjectHoursChart data={projectData} />
        <ThroughputChart data={throughput} />
      </section>

      <section className="space-y-3">
        <div><h2 className="font-heading text-lg font-semibold text-text-primary">Portfolio timeline</h2><p className="mt-1 text-sm text-text-muted">Projects, milestones, and tasks with schedule dates in the selected window.</p></div>
        <PortfolioGantt projects={projects} start={ganttStart} end={ganttEnd} />
      </section>

      <section className="space-y-3">
        <div><h2 className="font-heading text-lg font-semibold text-text-primary">Project health</h2><p className="mt-1 text-sm text-text-muted">At risk indicates overdue open tasks; late indicates a past project end date.</p></div>
        <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border-default bg-neutral-50 text-xs text-text-muted"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tasks</th><th className="px-4 py-3">Milestones</th><th className="px-4 py-3">Health</th></tr></thead>
            <tbody className="divide-y divide-border-default">{projects.map((project) => {
              const openOverdue = project.tasks.some((task) => task.dueDate && task.dueDate < today && !["COMPLETED", "CANCELLED"].includes(task.status));
              const late = project.endDate && project.endDate < today && project.status !== "COMPLETED" && project.status !== "ARCHIVED";
              const health = late ? "DELAYED" : openOverdue ? "ON_HOLD" : project.status === "COMPLETED" ? "COMPLETED" : "ACTIVE";
              return <tr key={project.id}><th className="px-4 py-3 font-medium"><Link href={`/projects/${project.id}`} className="text-brand-primary hover:underline">{project.code} · {project.title}</Link></th><td className="px-4 py-3"><StatusBadge status={project.status} /></td><td className="px-4 py-3 tabular-nums">{project.tasks.length}</td><td className="px-4 py-3 tabular-nums">{project.milestones.length}</td><td className="px-4 py-3"><StatusBadge status={health} /></td></tr>;
            })}{!projects.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No projects are available in your reporting scope.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      {deployments.length > 0 && <section className="space-y-3"><div><h2 className="font-heading text-lg font-semibold text-text-primary">Upcoming and active deployments</h2><p className="mt-1 text-sm text-text-muted">Assignments that may affect available capacity.</p></div><ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{deployments.map((deployment) => <li key={deployment.id} className="rounded-lg border border-border-default bg-surface p-4"><div className="flex items-center justify-between gap-2"><StatusBadge status={deployment.status} /><span className="text-xs text-text-muted">{formatDate(deployment.startDate)} – {formatDate(deployment.endDate)}</span></div><p className="mt-2 text-sm font-semibold text-text-primary">{deployment.location}</p><p className="mt-1 text-xs text-text-muted">{projects.find(({ id }) => id === deployment.projectId)?.code ?? "Project"} · assigned member {deployment.memberId.slice(0, 8)}</p></li>)}</ul></section>}
    </div>
  );
}

function PortfolioGantt({ projects, start, end }: {
  projects: Array<{
    id: string; code: string; title: string; status: string; startDate: Date | null; endDate: Date | null;
    milestones: Array<{ id: string; title: string; status: string; startDate: Date | null; targetDate: Date | null; completionPct: number }>;
    tasks: Array<{ id: string; title: string; status: string; startDate: Date | null; dueDate: Date | null; blocker: { title: string; taskNumber: number | null } | null }>;
  }>;
  start: Date;
  end: Date;
}) {
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
  const monthCount = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const months = Array.from({ length: monthCount }, (_, index) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)));
  const rows = projects.flatMap((project) => [
    { id: project.id, label: `${project.code} · ${project.title}`, start: project.startDate, end: project.endDate, kind: "project", href: `/projects/${project.id}` },
    ...project.milestones.map((item) => ({ id: item.id, label: `Milestone · ${item.title}`, start: item.startDate ?? item.targetDate, end: item.targetDate ?? item.startDate, kind: "milestone", href: `/projects/${project.id}` })),
    ...project.tasks.map((item) => ({ id: item.id, label: `Task · ${item.title}${item.blocker ? ` ← ${item.blocker.taskNumber ? `#${item.blocker.taskNumber} ` : ""}${item.blocker.title}` : ""}`, start: item.startDate ?? item.dueDate, end: item.dueDate ?? item.startDate, kind: "task", href: `/board/tasks/${item.id}` })),
  ]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
      <div className="min-w-[52rem]">
        <div className="grid border-b border-border-default bg-neutral-50" style={{ gridTemplateColumns: `minmax(14rem, 1.3fr) repeat(${months.length}, minmax(6rem, 1fr))` }}>
          <div className="px-3 py-3 text-xs font-semibold text-text-secondary">Work item</div>
          {months.map((month) => <div key={month.toISOString()} className="border-l border-border-default px-2 py-3 text-xs font-semibold text-text-secondary">{new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(month)}</div>)}
        </div>
        {rows.map((row) => {
          const from = row.start ?? start;
          const to = row.end ?? end;
          const left = Math.max(0, (from.getTime() - start.getTime()) / 86400000 / totalDays * 100);
          const width = Math.max(2, Math.min(100 - left, (to.getTime() - from.getTime() + 86400000) / 86400000 / totalDays * 100));
          return <div key={`${row.kind}-${row.id}`} className="grid min-h-11 items-center border-b border-border-default last:border-b-0" style={{ gridTemplateColumns: `minmax(14rem, 1.3fr) minmax(${months.length * 6}rem, ${months.length}fr)` }}>
            <Link href={row.href} title={row.label} className={`truncate px-3 text-xs ${row.kind === "project" ? "font-semibold text-text-primary" : "pl-6 text-text-secondary"}`}>{row.label}</Link>
            <div className="relative h-11 border-l border-border-default" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(${100 / months.length}% - 1px), var(--color-border-default) calc(${100 / months.length}% - 1px), var(--color-border-default) ${100 / months.length}%)` }}>
              {row.start && <span title={`${row.label}: ${formatDate(row.start)} to ${formatDate(row.end ?? row.start)}`} className={`absolute top-3 h-5 rounded ${row.kind === "project" ? "bg-brand-primary" : row.kind === "milestone" ? "bg-brand-accent" : "bg-info-dark"}`} style={{ left: `${left}%`, width: `${width}%` }} />}
            </div>
          </div>;
        })}
        {!rows.length && <p className="p-8 text-center text-sm text-text-muted">No dated work items are available to chart yet.</p>}
      </div>
    </div>
  );
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return <div className="rounded-lg border border-border-default bg-surface p-4"><p className="text-xs text-text-muted">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{value}</p><p className="mt-1 text-xs text-text-muted">{note}</p></div>;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
