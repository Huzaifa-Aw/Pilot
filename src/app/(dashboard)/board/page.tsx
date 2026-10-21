import type { Metadata } from "next";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { TaskBoard } from "@/components/data-display/task-board";
import { resolveTenantContext } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; assignee?: string; status?: string; priority?: string; milestone?: string; dueFrom?: string; dueTo?: string; mine?: string; q?: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const status = Object.values(TaskStatus).find((value) => value === params.status);
  const priority = Object.values(TaskPriority).find((value) => value === params.priority);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const projectId = params.project?.trim();
  const assigneeId = params.assignee?.trim();
  const search = params.q?.trim().slice(0, 120) ?? "";
  const milestoneId = params.milestone?.trim();
  const dueFrom = params.dueFrom && /^\d{4}-\d{2}-\d{2}$/.test(params.dueFrom) ? new Date(`${params.dueFrom}T00:00:00.000Z`) : null;
  const dueTo = params.dueTo && /^\d{4}-\d{2}-\d{2}$/.test(params.dueTo) ? new Date(`${params.dueTo}T23:59:59.999Z`) : null;
  const assignmentFilters = [
    ...(assigneeId ? [{ assignments: { some: { memberId: assigneeId } } }] : []),
    ...(params.mine === "true" ? [{ assignments: { some: { memberId: context.memberId } } }] : []),
  ];

  const [tasks, projects, members, milestones] = await Promise.all([
    db.task.findMany({
      where: {
        organizationId: context.organizationId,
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(milestoneId ? { milestoneId } : {}),
        ...(dueFrom || dueTo ? { dueDate: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } } : {}),
        ...(assignmentFilters.length ? { AND: assignmentFilters } : {}),
        ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
      select: {
        id: true,
        projectId: true,
        taskNumber: true,
        title: true,
        status: true,
        sortOrder: true,
        priority: true,
        dueDate: true,
        estimatedHrs: true,
        actualHrs: true,
        requiredDiscipline: true,
        project: { select: { id: true, code: true, title: true } },
        milestone: { select: { id: true, title: true } },
        assignments: {
          include: {
            member: {
              select: {
                id: true,
                discipline: true,
                user: { select: { name: true, image: true } },
                deploymentMemberships: {
                  where: {
                    organizationId: context.organizationId,
                    deployment: { status: { in: ["ACTIVE", "UPCOMING"] }, startDate: { lte: today }, endDate: { gte: today } },
                  },
                  select: { deployment: { select: { status: true, startDate: true, endDate: true, location: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    db.project.findMany({
      where: { organizationId: context.organizationId },
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      select: { id: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.milestone.findMany({
      where: { organizationId: context.organizationId, projectId: projectId ? projectId : undefined },
      select: { id: true, title: true, project: { select: { code: true } } },
      orderBy: [{ project: { code: "asc" } }, { sequenceNumber: "asc" }],
    }),
  ]);
  const projectMemberships = roleAtLeast(context.role, "MANAGER")
    ? await db.projectMember.findMany({
        where: { organizationId: context.organizationId, memberId: context.memberId },
        select: { projectId: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Shared workspace</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Task board</h1>
        <p className="mt-2 text-sm text-text-secondary">Every project task is visible to the whole workspace. Filters focus the shared board; access rules control changes.</p>
      </header>
      <form className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Search tasks</span>
          <input name="q" defaultValue={search} placeholder="Title or description" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Project</span>
          <select name="project" defaultValue={projectId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Assignee</span>
          <select name="assignee" defaultValue={assigneeId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All people</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.user.name ?? member.user.email}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Priority</span>
          <select name="priority" defaultValue={priority ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All priorities</option>
            {Object.values(TaskPriority).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Status</span>
          <select name="status" defaultValue={status ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All statuses</option>
            {Object.values(TaskStatus).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Milestone</span>
          <select name="milestone" defaultValue={milestoneId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All milestones</option>{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.project.code} · {milestone.title}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Due from</span><input type="date" name="dueFrom" defaultValue={params.dueFrom ?? ""} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Due to</span><input type="date" name="dueTo" defaultValue={params.dueTo ?? ""} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm text-text-secondary"><input type="checkbox" name="mine" value="true" defaultChecked={params.mine === "true"} className="size-4 accent-brand-primary" /> My tasks</label>
        <div className="flex items-end gap-2">
          <button className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-600">Apply filters</button>
          <a href="/board" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-text-secondary hover:bg-neutral-100">Clear</a>
        </div>
      </form>
      <TaskBoard
        initialTasks={tasks}
        canMoveAll={roleAtLeast(context.role, "ADMIN")}
        canMoveProjectIds={projectMemberships.map(({ projectId }) => projectId)}
        currentMemberId={context.memberId}
      />
    </div>
  );
}
