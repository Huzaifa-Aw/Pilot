"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MilestoneStatus, TaskPriority, TaskStatus } from "@prisma/client";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import type { MetadataInputValues } from "@/types/metadata";

type MemberOption = { id: string; name: string; discipline?: string | null };

export function TaskEditControl({
  projectId,
  task,
  workflowStatuses,
  labels,
  milestones,
  relatedTasks,
  members,
  metadataFields = [],
  initialMetadata = {},
}: {
  projectId: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    workflowStatusId: string | null;
    priority: TaskPriority;
    requiredDiscipline: string | null;
    estimatedHrs: number | null;
    actualHrs: number;
    startDate: Date | null;
    dueDate: Date | null;
    milestoneId: string | null;
    parentTaskId: string | null;
    blockedByTaskId: string | null;
    updatedAt: Date;
    assignments: Array<{ memberId: string }>;
    metadata: unknown;
    labels: Array<{ labelId: string }>;
    flaggedAt: Date | null;
    flagReason: string | null;
  };
  workflowStatuses: Array<{ id: string; name: string; category: TaskStatus; requiredFieldKeys: string[] }>;
  labels: Array<{ id: string; name: string }>;
  milestones: Array<{ id: string; title: string }>;
  relatedTasks: Array<{ id: string; title: string; taskNumber: number | null }>;
  members: MemberOption[];
  metadataFields?: MetadataFieldDefinition[];
  initialMetadata?: MetadataInputValues;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [metadata, setMetadata] = useState<MetadataInputValues>(initialMetadata);
  const [metadataChanged, setMetadataChanged] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    const estimated = value("estimatedHrs");
    const responseData = {
      title: value("title"),
      description: value("description"),
      workflowStatusId: value("workflowStatusId"),
      labelIds: data.getAll("labelIds").map(String),
      flagged: data.get("flagged") === "on",
      flagReason: value("flagReason") || null,
      priority: value("priority"),
      requiredDiscipline: value("requiredDiscipline") || null,
      estimatedHrs: estimated === "" ? null : Number(estimated),
      actualHrs: Number(value("actualHrs")),
      startDate: value("startDate") || null,
      dueDate: value("dueDate") || null,
      milestoneId: value("milestoneId") || null,
      parentTaskId: value("parentTaskId") || null,
      blockedByTaskId: value("blockedByTaskId") || null,
      assigneeIds: data.getAll("assigneeIds").map(String),
      updatedAt: value("updatedAt"),
      ...(metadataFields.length && metadataChanged ? { metadata } : {}),
    };
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(responseData),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Task couldn't be updated.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Task couldn't be deleted.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="mt-3 rounded-md border border-border-default">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold text-brand-primary">Edit task details</summary>
      <form onSubmit={(event) => void save(event)} className="space-y-3 border-t border-border-default p-3" noValidate>
        <input type="hidden" name="updatedAt" value={task.updatedAt.toISOString()} />
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Title</span>
          <input name="title" required minLength={2} maxLength={160} defaultValue={task.title} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Description</span>
          <textarea name="description" maxLength={10000} defaultValue={task.description ?? ""} rows={3} className="w-full rounded-md border border-border-default px-3 py-2 text-sm" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Workflow status</span>
            <select name="workflowStatusId" defaultValue={task.workflowStatusId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
              {workflowStatuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Priority</span>
            <select name="priority" defaultValue={task.priority} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
              {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as TaskPriority[]).map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Start date</span>
            <input type="date" name="startDate" defaultValue={dateValue(task.startDate)} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Due date</span>
            <input type="date" name="dueDate" defaultValue={dateValue(task.dueDate)} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Estimated hours</span>
            <input type="number" name="estimatedHrs" min="0" step="0.25" defaultValue={task.estimatedHrs ?? ""} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Actual hours</span>
            <input type="number" name="actualHrs" min="0" step="0.25" defaultValue={task.actualHrs} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Required discipline</span>
            <input name="requiredDiscipline" defaultValue={task.requiredDiscipline ?? ""} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Milestone</span>
            <select name="milestoneId" defaultValue={task.milestoneId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
              <option value="">No milestone</option>
              {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
            </select>
          </label>
          {labels.length > 0 && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-secondary">Labels</span>
              <select multiple name="labelIds" defaultValue={task.labels.map(({ labelId }) => labelId)} className="min-h-24 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm">
                {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
              </select>
            </label>
          )}
          <fieldset className="space-y-2 rounded-md border border-border-default p-3">
            <legend className="px-1 text-xs font-medium text-text-secondary">Flag</legend>
            <label className="flex min-h-10 items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" name="flagged" defaultChecked={Boolean(task.flaggedAt)} className="size-4 accent-brand-primary" />
              Flag this task
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Reason (optional)</span>
              <textarea name="flagReason" defaultValue={task.flagReason ?? ""} maxLength={2000} rows={2} className="w-full rounded-md border border-border-default px-3 py-2 text-sm" />
            </label>
          </fieldset>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Parent task (optional)</span>
            <select name="parentTaskId" defaultValue={task.parentTaskId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
              <option value="">No parent</option>{relatedTasks.map((item) => <option key={item.id} value={item.id}>{item.taskNumber ? `#${item.taskNumber} ` : ""}{item.title}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Blocked by (optional)</span>
            <select name="blockedByTaskId" defaultValue={task.blockedByTaskId ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
              <option value="">No blocker</option>{relatedTasks.map((item) => <option key={item.id} value={item.id}>{item.taskNumber ? `#${item.taskNumber} ` : ""}{item.title}</option>)}
            </select>
          </label>
        </div>
        <MetadataFieldsEditor fields={metadataFields} values={metadata} onChange={(key, value) => { setMetadataChanged(true); setMetadata((current) => ({ ...current, [key]: value })); }} />
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-text-secondary">Assignees</legend>
          <div className="max-h-40 overflow-y-auto rounded-md border border-border-default bg-surface p-2">
            {members.map((member) => (
              <label key={member.id} className="flex min-h-11 items-center gap-2 px-2 text-sm">
                <input type="checkbox" name="assigneeIds" value={member.id} defaultChecked={task.assignments.some(({ memberId }) => memberId === member.id)} className="size-4 accent-brand-primary" />
                <span>{member.name}</span>
                {member.discipline && <span className="ml-auto text-xs text-text-muted">{member.discipline}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save task"}</button>
          <button type="button" disabled={pending} onClick={() => void remove()} className="min-h-11 rounded-md border border-error-light px-4 text-sm font-semibold text-error-dark disabled:opacity-50">Delete task</button>
        </div>
      </form>
    </details>
  );
}

export function MilestoneEditControl({
  projectId,
  milestone,
  metadataFields = [],
  initialMetadata = {},
}: {
  projectId: string;
  milestone: {
    id: string;
    title: string;
    description: string | null;
    status: MilestoneStatus;
    sequenceNumber: number;
    startDate: Date | null;
    targetDate: Date | null;
    completionPct: number;
    requiresSignoff: boolean;
    signoffByMemberId: string | null;
    updatedAt: Date;
    metadata: unknown;
  };
  metadataFields?: MetadataFieldDefinition[];
  initialMetadata?: MetadataInputValues;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [metadata, setMetadata] = useState<MetadataInputValues>(initialMetadata);
  const [metadataChanged, setMetadataChanged] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: value("title"),
          description: value("description"),
          status: value("status"),
          sequenceNumber: Number(value("sequenceNumber")),
          startDate: value("startDate") || null,
          targetDate: value("targetDate") || null,
          completionPct: Number(value("completionPct")),
          requiresSignoff: data.get("requiresSignoff") === "on",
          signoffByMemberId: value("signoffByMemberId") || null,
          updatedAt: value("updatedAt"),
          ...(metadataFields.length && metadataChanged ? { metadata } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Milestone couldn't be updated.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete milestone "${milestone.title}"?`)) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones/${milestone.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Milestone couldn't be deleted.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="mt-3 rounded-md border border-border-default">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold text-brand-primary">Edit milestone</summary>
      <form onSubmit={(event) => void save(event)} className="space-y-3 border-t border-border-default p-3" noValidate>
        <input type="hidden" name="updatedAt" value={milestone.updatedAt.toISOString()} />
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Title</span>
          <input name="title" required minLength={2} maxLength={160} defaultValue={milestone.title} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Description</span>
          <textarea name="description" maxLength={10000} defaultValue={milestone.description ?? ""} rows={3} className="w-full rounded-md border border-border-default px-3 py-2 text-sm" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Sequence</span><input type="number" name="sequenceNumber" min="1" required defaultValue={milestone.sequenceNumber} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Status</span><select name="status" defaultValue={milestone.status} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">{(["PLANNED", "IN_PROGRESS", "UNDER_REVIEW", "APPROVED", "COMPLETED"] as MilestoneStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Start date</span><input type="date" name="startDate" defaultValue={dateValue(milestone.startDate)} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Target date</span><input type="date" name="targetDate" defaultValue={dateValue(milestone.targetDate)} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Completion %</span><input type="number" name="completionPct" min="0" max="100" step="1" defaultValue={Math.round(milestone.completionPct)} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary"><input type="checkbox" name="requiresSignoff" defaultChecked={milestone.requiresSignoff} className="size-4 accent-brand-primary" /> Requires signoff</label>
        </div>
        <MetadataFieldsEditor fields={metadataFields} values={metadata} onChange={(key, value) => { setMetadataChanged(true); setMetadata((current) => ({ ...current, [key]: value })); }} />
        {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save milestone"}</button>
          <button type="button" disabled={pending} onClick={() => void remove()} className="min-h-11 rounded-md border border-error-light px-4 text-sm font-semibold text-error-dark disabled:opacity-50">Delete milestone</button>
        </div>
      </form>
    </details>
  );
}

function dateValue(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? "";
}
