import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TimesheetPeriodStatus } from "@prisma/client";
import type { DeploymentStatus } from "@prisma/client";
import { BackLink } from "@/components/layout/BackLink";
import { WorklogCreateForm, WorklogList, TimesheetPeriodAction, TimesheetReminderButton, MarkReminderReadButton, BulkApproveTimesheets } from "@/components/forms/worklog-controls";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { reportTree } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { worklogsCsvTemplate } from "@/lib/csv-templates";

export const metadata: Metadata = { title: "Timesheets" };

type PageParams = { month?: string; tab?: string };

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  if (!roleAtLeast(context.role, "ENGINEER")) redirect("/overview");
  const params = await searchParams;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : currentMonth;
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const manager = roleAtLeast(context.role, "MANAGER");
  const tab = ["mine", "tempo", "team", "approvals"].includes(params.tab ?? "") ? params.tab! : "mine";
  const scopeMemberIds = manager
    ? roleAtLeast(context.role, "ADMIN")
      ? (await db.organizationMember.findMany({ where: { organizationId: context.organizationId, isActive: true }, select: { id: true } })).map(({ id }) => id)
      : await reportTree(context)
    : [context.memberId];
  const selectedMemberIds = tab === "mine" ? [context.memberId] : scopeMemberIds;
  const [worklogs, periods, members, projects, tasks, allocations, notifications] = await Promise.all([
    db.worklog.findMany({
      where: {
        organizationId: context.organizationId,
        memberId: { in: selectedMemberIds },
        date: { gte: monthStart, lt: monthEnd },
      },
      include: {
        member: { select: { id: true, capacityHrsPerWeek: true, dailyCapacityHrs: true, workingDays: true, user: { select: { name: true, email: true } } } },
        project: { select: { id: true, code: true, title: true } },
        task: { select: { id: true, title: true, taskNumber: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.timesheetPeriod.findMany({
      where: { organizationId: context.organizationId, memberId: { in: scopeMemberIds }, monthStart },
      select: { id: true, memberId: true, status: true, submittedAt: true, approvedAt: true, reviewNotes: true },
    }),
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, id: { in: scopeMemberIds }, isActive: true },
      include: {
        user: { select: { name: true, email: true } },
        deploymentMemberships: {
          where: {
            organizationId: context.organizationId,
            deployment: { status: { in: ["ACTIVE", "UPCOMING"] }, startDate: { lte: today }, endDate: { gte: today } },
          },
          include: { deployment: { select: { status: true, startDate: true, endDate: true, location: true } } },
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
    db.project.findMany({
      where: {
        organizationId: context.organizationId,
        ...(roleAtLeast(context.role, "ADMIN") ? {} : { members: { some: { memberId: { in: scopeMemberIds } } } }),
      },
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.task.findMany({
      where: {
        organizationId: context.organizationId,
        project: roleAtLeast(context.role, "ADMIN")
          ? { organizationId: context.organizationId }
          : { members: { some: { memberId: { in: scopeMemberIds } } } },
      },
      select: { id: true, projectId: true, title: true, taskNumber: true },
      orderBy: [{ projectId: "asc" }, { taskNumber: "asc" }],
    }),
    db.resourceAllocation.findMany({
      where: {
        organizationId: context.organizationId,
        memberId: { in: scopeMemberIds },
        weekStartDate: { gte: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1) - 7 * 86400000), lt: monthEnd },
      },
      select: { memberId: true, plannedHrs: true, weekStartDate: true },
    }),
    db.notification.findMany({
      where: { organizationId: context.organizationId, memberId: context.memberId, readAt: null, type: "TIMESHEET_REMINDER" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const periodByMember = new Map(periods.map((period) => [period.memberId, period]));
  const ownPeriod = periodByMember.get(context.memberId);
  const ownWorklogs = worklogs.filter((entry) => entry.memberId === context.memberId);
  const ownHours = ownWorklogs.reduce((sum, entry) => sum + entry.hours, 0);
  const expectedHours = expectedHoursForMonth(
    members.find(({ id }) => id === context.memberId)?.workingDays ?? [1, 2, 3, 4, 5],
    members.find(({ id }) => id === context.memberId)?.dailyCapacityHrs ?? 8,
    monthStart,
    monthEnd,
  );
  const totalsByMember = new Map<string, number>();
  for (const entry of worklogs) totalsByMember.set(entry.memberId, (totalsByMember.get(entry.memberId) ?? 0) + entry.hours);
  const totalsByProject = new Map<string, number>();
  const totalsByTask = new Map<string, number>();
  const totalsByPersonDay = new Map<string, number>();
  const totalsByDay = new Map<string, number>();
  for (const entry of worklogs) {
    const key = entry.project ? `${entry.project.code} · ${entry.project.title}` : entry.category ?? "Other";
    totalsByProject.set(key, (totalsByProject.get(key) ?? 0) + entry.hours);
    const taskKey = entry.task ? `${entry.project?.code ?? "Project"}-${entry.task.taskNumber ?? ""} ${entry.task.title}` : key;
    totalsByTask.set(taskKey, (totalsByTask.get(taskKey) ?? 0) + entry.hours);
    const dateKey = entry.date.toISOString().slice(0, 10);
    const personDay = `${entry.memberId}:${dateKey}`;
    totalsByPersonDay.set(personDay, (totalsByPersonDay.get(personDay) ?? 0) + entry.hours);
    totalsByDay.set(dateKey, (totalsByDay.get(dateKey) ?? 0) + entry.hours);
  }
  const totalPlanned = allocations.reduce((sum, allocation) => sum + allocation.plannedHrs, 0);
  const totalLogged = worklogs.reduce((sum, entry) => sum + entry.hours, 0);
  const plannedByMember = new Map<string, number>();
  for (const allocation of allocations) plannedByMember.set(allocation.memberId, (plannedByMember.get(allocation.memberId) ?? 0) + allocation.plannedHrs);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const dayTotals = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), index + 1)).toISOString().slice(0, 10);
    return { date, hours: totalsByDay.get(date) ?? 0 };
  });

  return (
    <div className="space-y-6">
      <BackLink href="/overview" label="Overview" currentPage="Timesheets" />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Time capture</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Timesheets</h1>
          <p className="mt-2 text-sm text-text-secondary">Log time against projects and tasks, then submit the month for review.</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {tab === "mine" && (
            <CsvImportPanel
              title="Import draft time records from CSV"
              endpoint="/api/worklogs/import"
              template={worklogsCsvTemplate}
              help="New or updated time records stay in open or reopened timesheets. Submitted and approved months cannot be changed. Use a stable externalKey to update the same row."
            />
          )}
          <form className="flex min-h-11 items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <label className="text-xs font-medium text-text-secondary" htmlFor="timesheet-month">Month</label>
            <input id="timesheet-month" type="month" name="month" defaultValue={month} className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-sm" />
            <button className="min-h-11 rounded-md border border-border-default px-3 text-sm font-semibold">Go</button>
          </form>
        </div>
      </header>

      {notifications.length > 0 && tab === "mine" && (
        <aside className="rounded-lg border border-warning-light bg-warning-light/40 p-4" aria-label="Timesheet reminders">
          <p className="text-sm font-semibold text-text-primary">Timesheet reminder</p>
          {notifications.map((item) => {
            const message = item.payload && typeof item.payload === "object" && "message" in item.payload && typeof item.payload.message === "string" ? item.payload.message : "Please complete your timesheet.";
            return <p key={item.id} className="mt-1 text-sm text-text-secondary">{message}<MarkReminderReadButton notificationId={item.id} /></p>;
          })}
        </aside>
      )}

      <nav aria-label="Timesheet views" className="flex gap-2 overflow-x-auto border-b border-border-default">
        <Tab href={`/timesheets?month=${month}&tab=mine`} active={tab === "mine"}>My timesheet</Tab>
        {manager && <Tab href={`/timesheets?month=${month}&tab=tempo`} active={tab === "tempo"}>Tempo</Tab>}
        {manager && <Tab href={`/timesheets?month=${month}&tab=team`} active={tab === "team"}>Team</Tab>}
        {manager && <Tab href={`/timesheets?month=${month}&tab=approvals`} active={tab === "approvals"}>Approvals</Tab>}
      </nav>

      {tab === "mine" && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Logged this month" value={`${ownHours.toFixed(1)}h`} />
            <Summary label="Expected" value={`${expectedHours.toFixed(1)}h`} />
            <Summary label="Remaining" value={`${Math.max(0, expectedHours - ownHours).toFixed(1)}h`} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={ownPeriod?.status ?? "OPEN"} />
            <span className="text-xs text-text-muted">{ownPeriod?.reviewNotes ?? "Entries are editable until submitted."}</span>
            {ownPeriod && ownPeriod.status !== "APPROVED" && <TimesheetPeriodAction periodId={ownPeriod.id} status={ownPeriod.status} action="SUBMITTED" />}
          </div>
          {ownPeriod?.status !== TimesheetPeriodStatus.SUBMITTED && ownPeriod?.status !== TimesheetPeriodStatus.APPROVED && (
            <WorklogCreateForm month={month} projects={projects} tasks={tasks} />
          )}
          <WorklogList entries={ownWorklogs} month={month} locked={ownPeriod?.status === TimesheetPeriodStatus.SUBMITTED || ownPeriod?.status === TimesheetPeriodStatus.APPROVED} />
        </section>
      )}

      {tab === "tempo" && manager && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Team logged" value={`${totalLogged.toFixed(1)}h`} />
            <Summary label="Planned allocations" value={`${totalPlanned.toFixed(1)}h`} />
            <Summary label="Variance" value={`${(totalLogged - totalPlanned).toFixed(1)}h`} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-border-default bg-neutral-50 text-xs text-text-muted"><tr><th className="px-4 py-3">Project / category</th><th className="px-4 py-3">Logged</th><th className="px-4 py-3">Share</th></tr></thead>
              <tbody className="divide-y divide-border-default">
                {[...totalsByProject.entries()].sort((a, b) => b[1] - a[1]).map(([title, hours]) => <tr key={title}><th className="px-4 py-3 font-medium text-text-primary">{title}</th><td className="px-4 py-3 tabular-nums">{hours.toFixed(1)}h</td><td className="px-4 py-3"><div className="h-2 w-full rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-brand-primary" style={{ width: `${totalLogged ? Math.min(100, hours / totalLogged * 100) : 0}%` }} /></div></td></tr>)}
                {!totalsByProject.size && <tr><td colSpan={3} className="px-4 py-8 text-center text-text-muted">No team time logged for this month.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
            <table className="w-full min-w-max text-left text-xs">
              <caption className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Tempo daily view · hours per person and date</caption>
              <thead className="border-y border-border-default bg-neutral-50 text-text-muted"><tr><th className="sticky left-0 z-10 min-w-40 bg-neutral-50 px-3 py-2">Person</th>{dayTotals.map(({ date }) => <th key={date} className={`min-w-12 px-2 py-2 text-center ${[0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay()) ? "bg-neutral-100" : ""}`}>{Number(date.slice(-2))}</th>)}<th className="min-w-16 px-3 py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-border-default">
                {members.map((member) => {
                  const total = totalsByMember.get(member.id) ?? 0;
                  const planned = plannedByMember.get(member.id) ?? 0;
                  return <tr key={member.id}><th className="sticky left-0 bg-surface px-3 py-3 font-medium text-text-primary">{member.user.name ?? member.user.email}<span className="block text-[10px] font-normal text-text-muted">Plan {planned.toFixed(1)}h</span></th>{dayTotals.map(({ date }) => <td key={date} className={`px-2 py-3 text-center tabular-nums ${[0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay()) ? "bg-neutral-50" : ""}`}>{totalsByPersonDay.get(`${member.id}:${date}`)?.toFixed(1) ?? "—"}</td>)}<td className="px-3 py-3 text-right font-semibold tabular-nums">{total.toFixed(1)}h</td></tr>;
                })}
                <tr className="bg-neutral-50"><th className="sticky left-0 bg-neutral-50 px-3 py-3 font-semibold">Daily total</th>{dayTotals.map(({ date, hours }) => <td key={date} className="px-2 py-3 text-center font-semibold tabular-nums">{hours ? hours.toFixed(1) : "—"}</td>)}<td className="px-3 py-3 text-right font-semibold tabular-nums">{totalLogged.toFixed(1)}h</td></tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-border-default bg-neutral-50 text-xs text-text-muted"><tr><th className="px-4 py-3">Task / project</th><th className="px-4 py-3">Logged</th><th className="px-4 py-3">Share</th></tr></thead>
              <tbody className="divide-y divide-border-default">{[...totalsByTask.entries()].sort((a, b) => b[1] - a[1]).map(([title, hours]) => <tr key={title}><th className="px-4 py-3 font-medium text-text-primary">{title}</th><td className="px-4 py-3 tabular-nums">{hours.toFixed(1)}h</td><td className="px-4 py-3"><div className="h-2 w-full rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-brand-primary" style={{ width: `${totalLogged ? Math.min(100, hours / totalLogged * 100) : 0}%` }} /></div></td></tr>)}{!totalsByTask.size && <tr><td colSpan={3} className="px-4 py-8 text-center text-text-muted">No task time logged this month.</td></tr>}</tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">Includes only your direct and indirect reports, or all active people for Admin and Owner.</p>
        </section>
      )}

      {tab === "team" && manager && (
        <TeamView month={month} members={members} currentMemberId={context.memberId} worklogTotals={totalsByMember} periods={periodByMember} expectedHours={expectedHoursForMonth} monthStart={monthStart} monthEnd={monthEnd} canLogForOthers={roleAtLeast(context.role, "ADMIN")} projects={projects} tasks={tasks} />
      )}

      {tab === "approvals" && manager && (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-text-primary">Submitted months</h2>
          {periods.filter((period) => period.status === TimesheetPeriodStatus.SUBMITTED && period.memberId !== context.memberId).length ? <>
            <div className="grid gap-2 sm:grid-cols-2">
              <BulkApproveTimesheets periodIds={periods.filter((period) => period.status === TimesheetPeriodStatus.SUBMITTED && period.memberId !== context.memberId).map(({ id }) => id)} />
              <BulkApproveTimesheets action="REOPENED" periodIds={periods.filter((period) => period.status === TimesheetPeriodStatus.SUBMITTED && period.memberId !== context.memberId).map(({ id }) => id)} />
            </div>
            {periods.filter((period) => period.status === TimesheetPeriodStatus.SUBMITTED && period.memberId !== context.memberId).map((period) => {
            const member = members.find(({ id }) => id === period.memberId);
            const hours = totalsByMember.get(period.memberId) ?? 0;
            return <article key={period.id} className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-text-primary">{member?.user.name ?? member?.user.email ?? "Member"}</p><p className="mt-1 text-xs text-text-muted">{month} · {hours.toFixed(1)} hours</p></div>
              <div className="flex flex-wrap gap-2"><TimesheetPeriodAction periodId={period.id} status={period.status} action="APPROVED" review /><TimesheetPeriodAction periodId={period.id} status={period.status} action="REOPENED" review /></div>
            </article>;
          })}</> : <p className="rounded-lg border border-dashed border-neutral-300 bg-surface p-8 text-center text-sm text-text-muted">No submitted months are waiting for approval.</p>}
        </section>
      )}
    </div>
  );
}

function TeamView({
  month,
  members,
  currentMemberId,
  worklogTotals,
  periods,
  expectedHours,
  monthStart,
  monthEnd,
  canLogForOthers,
  projects,
  tasks,
}: {
  month: string;
  members: Array<{
    id: string;
    user: { name: string | null; email: string };
    workingDays: number[];
    dailyCapacityHrs: number;
    deploymentMemberships: Array<{ deployment: { status: DeploymentStatus; startDate: Date; endDate: Date; location: string } }>;
  }>;
  currentMemberId: string;
  worklogTotals: Map<string, number>;
  periods: Map<string, { id: string; memberId: string; status: TimesheetPeriodStatus }>;
  expectedHours: (workingDays: number[], dailyCapacity: number, start: Date, end: Date) => number;
  monthStart: Date;
  monthEnd: Date;
  canLogForOthers: boolean;
  projects: Array<{ id: string; code: string; title: string }>;
  tasks: Array<{ id: string; projectId: string; title: string; taskNumber: number | null }>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold text-text-primary">Team progress</h2>
      {canLogForOthers && <WorklogCreateForm month={month} projects={projects} tasks={tasks} membersForAdmin={members.map((member) => ({ id: member.id, name: member.user.name ?? member.user.email }))} />}
      {members.map((member) => {
        const period = periods.get(member.id);
        const logged = worklogTotals.get(member.id) ?? 0;
        const expected = expectedHours(member.workingDays, member.dailyCapacityHrs, monthStart, monthEnd);
        return <article key={member.id} className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-center">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{member.user.name ?? member.user.email}</p><div className="mt-1">{member.deploymentMemberships.map(({ deployment }, index) => <OnDeploymentBadge key={`${member.id}-deployment-${index}`} status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} />)}</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-brand-primary" style={{ width: `${expected ? Math.min(100, logged / expected * 100) : 0}%` }} /></div></div>
          <span className="text-sm tabular-nums text-text-secondary">{logged.toFixed(1)} / {expected.toFixed(1)}h</span>
          <StatusBadge status={period?.status ?? "OPEN"} />
          {member.id === currentMemberId
            ? <span className="text-xs text-text-muted">Your own sheet</span>
            : period?.status === TimesheetPeriodStatus.SUBMITTED
              ? <div className="flex flex-wrap gap-2"><TimesheetPeriodAction periodId={period.id} status={period.status} action="APPROVED" review /><TimesheetPeriodAction periodId={period.id} status={period.status} action="REOPENED" review /></div>
              : <TimesheetReminderButton memberId={member.id} month={month} />}
        </article>;
      })}
      {!members.length && <p className="rounded-lg border border-dashed border-neutral-300 bg-surface p-8 text-center text-sm text-text-muted">No active team members are in your reporting scope.</p>}
    </section>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold ${active ? "border-brand-primary text-brand-primary" : "border-transparent text-text-muted hover:text-text-primary"}`}>{children}</Link>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border-default bg-surface p-4"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{value}</p></div>;
}

function expectedHoursForMonth(workingDays: number[], dailyCapacity: number, start: Date, end: Date) {
  let days = 0;
  for (const date = new Date(start); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (workingDays.includes(date.getUTCDay()) && date <= new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")) days += 1;
  }
  return days * dailyCapacity;
}
