"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Flag, GripVertical, Rows3, View } from "lucide-react";
import type { DeploymentStatus, TaskPriority, TaskStatus } from "@prisma/client";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import { TaskLabelBadge } from "@/components/data-display/task-label-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

type WorkflowStatus = {
  id: string;
  name: string;
  category: TaskStatus;
  sortOrder: number;
};

type TaskWorkflow = {
  id: string;
  name: string;
  statuses: WorkflowStatus[];
};

type BoardTask = {
  id: string;
  projectId: string;
  taskNumber: number | null;
  title: string;
  status: TaskStatus;
  workflowStatusId: string | null;
  workflowStatus: { id: string; name: string; category: TaskStatus; sortOrder: number } | null;
  sortOrder: number;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedHrs: number | null;
  actualHrs: number;
  flaggedAt: Date | null;
  flagReason: string | null;
  project: { id: string; code: string; title: string; workflow: TaskWorkflow | null };
  milestone: { id: string; title: string } | null;
  labels: Array<{ label: { id: string; name: string; color: string } }>;
  assignments: Array<{
    memberId: string;
    member: {
      id: string;
      discipline: string | null;
      user: { name: string | null; image: string | null };
      deploymentMemberships: Array<{ deployment: { status: DeploymentStatus; startDate: Date; endDate: Date; location: string } }>;
    };
  }>;
  requiredDiscipline: string | null;
};

type BoardLane = { id: string; label: string; workflow: TaskWorkflow; tasks: BoardTask[] };
type Swimlane = "none" | "project" | "assignee";
type ListSort = "title" | "status" | "priority" | "dueDate";

function taskStatusId(task: BoardTask) {
  return task.workflowStatusId ?? task.project.workflow?.statuses.find(({ category }) => category === task.status)?.id ?? "";
}

function getLanes(tasks: BoardTask[], workflows: TaskWorkflow[], swimlane: Swimlane): BoardLane[] {
  const lanes = new Map<string, BoardLane>();
  for (const task of tasks) {
    const workflow = task.project.workflow;
    if (!workflow) continue;
    const assignee = task.assignments[0];
    const laneId = swimlane === "project"
      ? task.projectId
      : swimlane === "assignee"
        ? assignee?.memberId ?? "unassigned"
        : workflow.id;
    const id = `${laneId}::${workflow.id}`;
    const label = swimlane === "project"
      ? `${task.project.code} · ${task.project.title}`
      : swimlane === "assignee"
        ? assignee?.member.user.name ?? "Unassigned"
        : workflows.length > 1 ? workflow.name : "";
    const lane = lanes.get(id) ?? { id, label, workflow, tasks: [] };
    lane.tasks.push(task);
    lanes.set(id, lane);
  }
  if (lanes.size) return [...lanes.values()];
  return workflows.map((workflow) => ({
    id: `${workflow.id}::${workflow.id}`,
    label: workflows.length > 1 ? workflow.name : "",
    workflow,
    tasks: [],
  }));
}

export function TaskBoard({
  initialTasks,
  workflows,
  canMoveAll,
  canMoveProjectIds,
  currentMemberId,
}: {
  initialTasks: BoardTask[];
  workflows: TaskWorkflow[];
  canMoveAll: boolean;
  canMoveProjectIds: string[];
  currentMemberId: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState("");
  const [swimlane, setSwimlane] = useState<Swimlane>("none");
  const [view, setView] = useState<"board" | "list">("board");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<ListSort>("status");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const lanes = getLanes(tasks, workflows, swimlane);

  async function updateTask(
    task: BoardTask,
    update: { workflowStatusId?: string; sortOrder?: number; flaggedAt?: Date | null },
  ) {
    const previous = tasks;
    const targetStatus = update.workflowStatusId
      ? task.project.workflow?.statuses.find(({ id }) => id === update.workflowStatusId)
      : undefined;
    setError("");
    setTasks((items) => items.map((item) => item.id === task.id
      ? {
          ...item,
          ...(targetStatus ? { workflowStatusId: targetStatus.id, status: targetStatus.category } : {}),
          ...(update.sortOrder !== undefined ? { sortOrder: update.sortOrder } : {}),
          ...(update.flaggedAt !== undefined ? { flaggedAt: update.flaggedAt } : {}),
        }
      : item));
    try {
      const response = await fetch(`/api/projects/${task.projectId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...update,
          ...(update.flaggedAt !== undefined ? { flagged: Boolean(update.flaggedAt) } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        setTasks(previous);
        setError(result.error ?? "Task couldn't be updated.");
      }
    } catch {
      setTasks(previous);
      setError("We couldn't reach the server. The task was returned to its previous state.");
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const task = tasks.find(({ id }) => id === event.active.id);
    if (!task || !event.over) return;
    const targetTask = tasks.find(({ id }) => id === event.over?.id);
    const overId = String(event.over.id);
    const separator = overId.lastIndexOf("::");
    const targetStatusId = targetTask ? taskStatusId(targetTask) : overId.slice(separator + 2);
    const laneId = lanes.find((lane) => lane.tasks.some(({ id }) => id === task.id))?.id;
    const targetLaneId = targetTask
      ? lanes.find((lane) => lane.tasks.some(({ id }) => id === targetTask.id))?.id
      : overId.slice(0, separator);
    const destinationStatus = task.project.workflow?.statuses.find(({ id }) => id === targetStatusId);
    if (!destinationStatus || (targetTask && taskStatusId(targetTask) !== targetStatusId)) return;
    if (laneId !== targetLaneId) return;
    const lane = lanes.find(({ id }) => id === laneId);
    if (!lane || lane.workflow.id !== task.project.workflow?.id) return;
    const laneOf = (item: BoardTask) => swimlane === "project"
      ? item.projectId
      : swimlane === "assignee"
        ? item.assignments[0]?.memberId ?? "unassigned"
        : item.project.workflow?.id ?? "";
    const destination = tasks
      .filter((item) => taskStatusId(item) === targetStatusId && item.id !== task.id && laneOf(item) === laneOf(task))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = targetTask ? destination.findIndex(({ id }) => id === targetTask.id) : destination.length;
    const nextIndex = targetTask && targetIndex >= 0 ? targetIndex : destination.length;
    const previousRank = destination[nextIndex - 1]?.sortOrder;
    const nextRank = destination[nextIndex]?.sortOrder;
    const sortOrder = previousRank === undefined
      ? (nextRank ?? 0) - 1
      : nextRank === undefined
        ? previousRank + 1
        : (previousRank + nextRank) / 2;
    if (taskStatusId(task) !== destinationStatus.id || task.sortOrder !== sortOrder) {
      await updateTask(task, { workflowStatusId: destinationStatus.id, sortOrder });
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (sort === "priority") return priorityRank(a.priority) - priorityRank(b.priority);
    if (sort === "status") return (a.workflowStatus?.name ?? a.status).localeCompare(b.workflowStatus?.name ?? b.status);
    if (sort === "dueDate") return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light p-3 text-sm text-error-dark">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Task view">
          <Button type="button" variant={view === "board" ? "primary" : "secondary"} aria-pressed={view === "board"} onClick={() => setView("board")}><View aria-hidden="true" /> Board</Button>
          <Button type="button" variant={view === "list" ? "primary" : "secondary"} aria-pressed={view === "list"} onClick={() => setView("list")}><Rows3 aria-hidden="true" /> List</Button>
        </div>
        {view === "board" && <label className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="font-medium">Swimlane</span>
          <select value={swimlane} onChange={(event) => {
            const value = event.target.value;
            if (value === "none" || value === "project" || value === "assignee") setSwimlane(value);
          }} className="min-h-11 rounded-md border border-border-default bg-surface px-3">
            <option value="none">Workflow</option><option value="project">Project</option><option value="assignee">Assignee</option>
          </select>
        </label>}
        {view === "list" && <label className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="font-medium">Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as ListSort)} className="min-h-11 rounded-md border border-border-default bg-surface px-3">
            <option value="status">Workflow status</option><option value="priority">Priority</option><option value="dueDate">Due date</option><option value="title">Title</option>
          </select>
        </label>}
      </div>

      {view === "board" ? (
        <>
          <label className="flex items-center gap-2 text-sm text-text-secondary md:hidden">
            <span className="font-medium">Status column</span>
            <select className="min-h-11 flex-1 rounded-md border border-border-default bg-surface px-3" onChange={(event) => document.getElementById(event.target.value)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}>
              {lanes.flatMap((lane) => lane.workflow.statuses.map((status) => <option key={`${lane.id}-${status.id}`} value={`board-column-${lane.id}-${status.id}`}>{lane.label ? `${lane.label} · ` : ""}${status.name}</option>))}
            </select>
          </label>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={(event) => void onDragEnd(event)}>
            <div className="space-y-5">
              {lanes.map((lane) => (
                <section key={lane.id} className="space-y-2">
                  {lane.label && <h2 className="font-heading text-base font-semibold text-text-primary">{lane.label}</h2>}
                  <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
                    {lane.workflow.statuses.map((status) => {
                      const key = `${lane.id}-${status.id}`;
                      const items = lane.tasks.filter((task) => taskStatusId(task) === status.id).sort((a, b) => a.sortOrder - b.sortOrder);
                      return (
                        <BoardColumn
                          key={key}
                          id={`board-column-${key}`}
                          droppableId={`${lane.id}::${status.id}`}
                          label={status.name}
                          count={items.length}
                          collapsed={Boolean(collapsed[key])}
                          onToggle={() => setCollapsed((current) => ({ ...current, [key]: !current[key] }))}
                        >
                          {items.map((task) => (
                            <BoardCard
                              key={task.id}
                              task={task}
                              statuses={task.project.workflow?.statuses ?? []}
                              canMove={canMoveAll || canMoveProjectIds.includes(task.projectId) || task.assignments.some(({ memberId }) => memberId === currentMemberId)}
                              onMove={(workflowStatusId) => void updateTask(task, { workflowStatusId })}
                              onToggleFlag={() => void updateTask(task, { flaggedAt: task.flaggedAt ? null : new Date() })}
                            />
                          ))}
                        </BoardColumn>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </DndContext>
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-surface">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <tr><th className="px-4 py-3">Task</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assignees</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Hours</th></tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {sortedTasks.map((task) => {
                const statusName = task.project.workflow?.statuses.find(({ id }) => id === taskStatusId(task))?.name ?? task.status;
                const canMove = canMoveAll || canMoveProjectIds.includes(task.projectId) || task.assignments.some(({ memberId }) => memberId === currentMemberId);
                return <tr key={task.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3"><Link href={`/board/tasks/${task.id}`} className="block min-w-48 text-sm font-semibold text-brand-primary hover:underline">{task.title}<span className="mt-1 block font-mono text-[11px] text-text-muted">{task.project.code}-{task.taskNumber ?? task.id.slice(0, 6)}</span></Link>{task.flaggedAt && <StatusBadge status="FLAGGED" className="mt-1" />}{task.labels.map(({ label }) => <TaskLabelBadge key={label.id} name={label.name} color={label.color} />)}</td>
                  <td className="px-4 py-3 text-text-secondary">{task.project.code} · {task.project.title}</td>
                  <td className="px-4 py-3">{canMove ? <select aria-label={`Status for ${task.title}`} value={taskStatusId(task)} onChange={(event) => void updateTask(task, { workflowStatusId: event.target.value })} className="min-h-10 rounded-md border border-border-default bg-surface px-2 text-xs">{task.project.workflow?.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select> : <StatusBadge status={statusName} colorKey={task.workflowStatus?.category ?? task.status} />}</td>
                  <td className="px-4 py-3"><StatusBadge status={task.priority} /></td>
                  <td className="px-4 py-3"><span className="block min-w-36 text-xs text-text-secondary">{task.assignments.map(({ member }) => member.user.name ?? "Member").join(", ") || "Unassigned"}</span></td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{task.dueDate ? formatDate(task.dueDate) : "—"}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-text-secondary">{task.actualHrs} / {task.estimatedHrs ?? "—"}h</td>
                </tr>;
              })}
              {!sortedTasks.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">No tasks match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  id,
  droppableId,
  label,
  count,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  droppableId: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <section id={id} ref={setNodeRef} aria-label={`${label}, ${count} tasks`} className={`min-h-72 w-[min(86vw,21rem)] shrink-0 snap-start rounded-lg border p-3 ${isOver ? "border-brand-primary bg-info-light/40" : "border-border-default bg-neutral-50"}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs tabular-nums text-text-secondary">{count}</span>
          <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? "Show" : "Hide"} ${label} tasks`} onClick={onToggle} className="min-h-9 rounded-md px-2 text-xs font-medium text-brand-primary hover:bg-neutral-100">
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </header>
      {!collapsed && <div className="space-y-2">{children}</div>}
    </section>
  );
}

function BoardCard({
  task,
  statuses,
  canMove,
  onMove,
  onToggleFlag,
}: {
  task: BoardTask;
  statuses: WorkflowStatus[];
  canMove: boolean;
  onMove: (workflowStatusId: string) => void;
  onToggleFlag: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !canMove });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.6 : 1 };
  const disciplineMismatch = Boolean(task.requiredDiscipline && task.assignments.some(({ member }) =>
    task.requiredDiscipline?.trim().toLowerCase() !== (member.discipline ?? "").trim().toLowerCase()));
  const overdue = Boolean(task.dueDate && task.dueDate < new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") && task.status !== "COMPLETED" && task.status !== "CANCELLED");
  return (
    <article ref={setNodeRef} style={style} className="rounded-md border border-border-default bg-surface p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/board/tasks/${task.id}`} className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-text-muted">{task.project.code}-{task.taskNumber ?? task.id.slice(0, 6)} · {task.project.title}</p>
          <h4 className="mt-1 text-sm font-semibold leading-5 text-text-primary">{task.title}</h4>
        </Link>
        {canMove && (
          <button type="button" aria-label={`Drag ${task.title}`} className="inline-flex min-h-10 min-w-10 touch-none items-center justify-center rounded-md border border-border-default text-text-muted hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-brand-primary" {...listeners} {...attributes}>
            <GripVertical size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.priority} />
        {task.dueDate && <span className={`text-xs ${overdue ? "font-semibold text-error-dark" : "text-text-muted"}`}>{overdue ? "Overdue · " : "Due "}{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(task.dueDate)}</span>}
        {task.milestone && <span className="rounded bg-neutral-100 px-2 py-1 text-[11px] text-text-secondary">{task.milestone.title}</span>}
        {disciplineMismatch && <span className="rounded bg-warning-light px-2 py-1 text-[11px] text-warning-dark">Discipline mismatch</span>}
        {task.flaggedAt && <StatusBadge status="FLAGGED" />}
        {task.labels.map(({ label }) => <TaskLabelBadge key={label.id} name={label.name} color={label.color} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-secondary">{task.assignments.map(({ member }) => member.user.name ?? "Member").join(", ") || "Unassigned"}</span>
        {task.assignments.flatMap(({ memberId, member }) => member.deploymentMemberships.map(({ deployment }) => <OnDeploymentBadge key={`${task.id}-${memberId}-deployment`} status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} />))}
        <span className="text-xs tabular-nums text-text-muted">{task.actualHrs}h{task.estimatedHrs ? ` / ${task.estimatedHrs}h` : ""}</span>
      </div>
      {canMove && (
        <div className="mt-2 flex items-center gap-2">
          <label className="min-w-0 flex-1 text-xs text-text-secondary">
            <span className="sr-only">Move {task.title} to status</span>
            <select aria-label={`Move ${task.title} to status`} value={taskStatusId(task)} onChange={(event) => onMove(event.target.value)} className="min-h-10 w-full rounded-md border border-border-default bg-surface px-2 text-xs">
              {statuses.map((status) => <option value={status.id} key={status.id}>{status.name}</option>)}
            </select>
          </label>
          <button type="button" aria-pressed={Boolean(task.flaggedAt)} aria-label={`${task.flaggedAt ? "Remove flag from" : "Flag"} ${task.title}`} onClick={onToggleFlag} className={`inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors duration-150 ${task.flaggedAt ? "bg-warning-light text-warning-dark" : "text-text-muted hover:bg-neutral-100"}`}>
            <Flag size={14} aria-hidden="true" />{task.flaggedAt ? "Flagged" : "Flag"}
          </button>
        </div>
      )}
      {!canMove && <p className="mt-2 text-[11px] text-text-muted">Read-only — ask a project manager to move this task.</p>}
    </article>
  );
}

function priorityRank(priority: TaskPriority) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[priority];
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
