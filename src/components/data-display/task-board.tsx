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
import { StatusBadge } from "@/components/ui/status-badge";
import { OnDeploymentBadge } from "@/components/data-display/on-deployment-badge";
import type { DeploymentStatus, TaskPriority, TaskStatus } from "@prisma/client";

type BoardTask = {
  id: string;
  projectId: string;
  taskNumber: number | null;
  title: string;
  status: TaskStatus;
  sortOrder: number;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedHrs: number | null;
  actualHrs: number;
  project: { id: string; code: string; title: string };
  milestone: { id: string; title: string } | null;
  assignments: Array<{ memberId: string; member: { id: string; discipline: string | null; user: { name: string | null; image: string | null }; deploymentMemberships: Array<{ deployment: { status: DeploymentStatus; startDate: Date; endDate: Date; location: string } }> } }>;
  requiredDiscipline: string | null;
};

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "UNDER_REVIEW", label: "Under review" },
  { status: "APPROVED", label: "Approved" },
  { status: "COMPLETED", label: "Completed" },
  { status: "CANCELLED", label: "Cancelled" },
];

export function TaskBoard({
  initialTasks,
  canMoveAll,
  canMoveProjectIds,
  currentMemberId,
}: {
  initialTasks: BoardTask[];
  canMoveAll: boolean;
  canMoveProjectIds: string[];
  currentMemberId: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState("");
  const [swimlane, setSwimlane] = useState<"none" | "project" | "assignee">("none");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  async function changeStatus(task: BoardTask, nextStatus: TaskStatus, sortOrder?: number) {
    const previous = tasks;
    setError("");
    setTasks((items) => items.map((item) => item.id === task.id
      ? { ...item, status: nextStatus, ...(sortOrder !== undefined ? { sortOrder } : {}) }
      : item));
    try {
      const response = await fetch(`/api/projects/${task.projectId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus, ...(sortOrder !== undefined ? { sortOrder } : {}) }),
      });
      if (!response.ok) {
        const result = await response.json();
        setTasks(previous);
        setError(result.error ?? "Task status could not be updated.");
      }
    } catch {
      setTasks(previous);
      setError("We couldn't reach the server. The task was returned to its previous column.");
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const task = tasks.find(({ id }) => id === event.active.id);
    if (!task || !event.over) return;
    const targetTask = tasks.find(({ id }) => id === event.over?.id);
    const overId = String(event.over.id);
    const laneOf = (item: BoardTask) => swimlane === "project" ? item.projectId : swimlane === "assignee" ? item.assignments[0]?.memberId ?? "unassigned" : "all";
    const [columnLaneId, targetStatusValue] = overId.includes("::") ? overId.split("::") : ["all", overId];
    const targetLaneId = targetTask ? laneOf(targetTask) : columnLaneId;
    const status = targetTask?.status ?? columns.find(({ status }) => status === targetStatusValue)?.status;
    if (!status) return;
    if (swimlane !== "none" && targetLaneId !== laneOf(task)) return;
    if (targetTask && laneOf(targetTask) !== laneOf(task)) return;
    const destination = tasks.filter((item) => item.status === status && item.id !== task.id && laneOf(item) === laneOf(task))
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
    if (task.status !== status || task.sortOrder !== sortOrder) await changeStatus(task, status, sortOrder);
  }

  const mobile = tasks.reduce<Record<TaskStatus, number>>((counts, task) => {
    counts[task.status] += 1;
    return counts;
  }, { BACKLOG: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, APPROVED: 0, COMPLETED: 0, CANCELLED: 0 });
  const lanes = swimlane === "none" || !tasks.length
    ? [{ id: "all", label: "", tasks }]
    : swimlane === "project"
      ? [...new Map(tasks.map((task) => [task.projectId, { id: task.projectId, label: `${task.project.code} · ${task.project.title}`, tasks: tasks.filter((item) => item.projectId === task.projectId) }])).values()]
      : [...new Map(tasks.map((task) => {
          const member = task.assignments[0]?.member;
          const id = task.assignments[0]?.memberId ?? "unassigned";
          return [id, { id, label: member?.user.name ?? "Unassigned", tasks: tasks.filter((item) => (item.assignments[0]?.memberId ?? "unassigned") === id) }];
        })).values()];
  const firstLaneId = lanes[0]?.id ?? "all";

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light p-3 text-sm text-error-dark">{error}</p>}
      <label className="flex max-w-sm items-center gap-2 text-sm text-text-secondary">
        <span className="font-medium">Swimlane</span>
        <select value={swimlane} onChange={(event) => {
          const value = event.target.value;
          if (value === "none" || value === "project" || value === "assignee") setSwimlane(value);
        }} className="min-h-11 flex-1 rounded-md border border-border-default bg-surface px-3">
          <option value="none">No grouping</option><option value="project">Group by project</option><option value="assignee">Group by assignee</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-text-secondary md:hidden">
        <span className="font-medium">Status column</span>
        <select className="min-h-11 flex-1 rounded-md border border-border-default bg-surface px-3" onChange={(event) => document.getElementById(`board-column-${firstLaneId}-${event.target.value}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}>
          {columns.map(({ status, label }) => <option key={status} value={status}>{label} ({mobile[status]})</option>)}
        </select>
      </label>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={(event) => void onDragEnd(event)}>
        <div className="space-y-5">
          {lanes.map((lane) => <section key={lane.id} className="space-y-2">
            {lane.label && <h2 className="font-heading text-base font-semibold text-text-primary">{lane.label}</h2>}
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3 2xl:grid-cols-6">
              {columns.map(({ status, label }) => {
                const items = lane.tasks.filter((task) => task.status === status).sort((a, b) => a.sortOrder - b.sortOrder);
                return (
                  <BoardColumn key={`${lane.id}-${status}`} droppableId={`${lane.id}::${status}`} status={status} laneId={lane.id} label={label} count={items.length}>
                    {items.map((task) => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        canMove={canMoveAll || canMoveProjectIds.includes(task.projectId) || task.assignments.some(({ memberId }) => memberId === currentMemberId)}
                        onMove={(next) => void changeStatus(task, next)}
                      />
                    ))}
                  </BoardColumn>
                );
              })}
            </div>
          </section>)}
        </div>
      </DndContext>
    </div>
  );
}

function BoardColumn({ status, laneId, droppableId, label, count, children }: {
  status: TaskStatus; laneId: string; droppableId: string; label: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <section id={`board-column-${laneId}-${status}`} ref={setNodeRef} aria-label={`${label}, ${count} tasks`}
      className={`min-h-72 w-[min(86vw,21rem)] shrink-0 snap-start rounded-lg border p-3 md:w-auto md:min-w-0 ${isOver ? "border-brand-primary bg-info-light/40" : "border-border-default bg-neutral-50"}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{label}</h2>
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs tabular-nums text-text-secondary">{count}</span>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function BoardCard({ task, canMove, onMove }: { task: BoardTask; canMove: boolean; onMove: (status: TaskStatus) => void }) {
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
          <h3 className="mt-1 text-sm font-semibold leading-5 text-text-primary">{task.title}</h3>
        </Link>
        {canMove && (
          <button type="button" aria-label={`Move ${task.title}`} className="hidden min-h-11 min-w-11 touch-none items-center justify-center rounded-md border border-border-default text-xs text-text-muted hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-brand-primary md:inline-flex" {...listeners} {...attributes}>
            Move
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.priority} />
        {task.dueDate && <span className={`text-xs ${overdue ? "font-semibold text-error-dark" : "text-text-muted"}`}>{overdue ? "Overdue · " : "Due "}{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(task.dueDate)}</span>}
        {task.milestone && <span className="rounded bg-neutral-100 px-2 py-1 text-[11px] text-text-secondary">{task.milestone.title}</span>}
        {disciplineMismatch && <span className="rounded bg-warning-light px-2 py-1 text-[11px] text-warning-dark">Discipline mismatch</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex -space-x-1.5" aria-label="Assignees">
          {task.assignments.map(({ memberId, member }) => (
            <span key={memberId} title={member.user.name ?? "Workspace member"} className="flex size-7 items-center justify-center rounded-full border-2 border-surface bg-info-light text-[10px] font-semibold text-brand-primary">
              {(member.user.name ?? "?").slice(0, 1).toUpperCase()}
              {member.deploymentMemberships[0] && <span className="sr-only">On deployment at {member.deploymentMemberships[0].deployment.location}</span>}
            </span>
          ))}
          {!task.assignments.length && <span className="text-xs text-text-muted">Unassigned</span>}
        </div>
        {task.assignments.flatMap(({ memberId, member }) => member.deploymentMemberships.map(({ deployment }) => <OnDeploymentBadge key={`${task.id}-${memberId}-deployment`} status={deployment.status} startDate={deployment.startDate} endDate={deployment.endDate} location={deployment.location} />))}
        <span className="text-xs tabular-nums text-text-muted">{task.actualHrs}h{task.estimatedHrs ? ` / ${task.estimatedHrs}h` : ""}</span>
      </div>
      {canMove && (
        <label className="mt-2 block text-xs text-text-secondary md:hidden">
          Move to
          <select aria-label={`Move ${task.title} to status`} value={task.status} onChange={(event) => onMove(event.target.value as TaskStatus)} className="mt-1 min-h-11 w-full rounded-md border border-border-default bg-surface px-2 text-xs">
            {columns.map(({ status, label }) => <option value={status} key={status}>{label}</option>)}
          </select>
        </label>
      )}
      {!canMove && <p className="mt-2 text-[11px] text-text-muted">Read-only — ask a project manager to move this task.</p>}
    </article>
  );
}
