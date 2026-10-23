"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import { TASK_PRIORITIES } from "@/lib/constants";
import { taskCreateSchema } from "@/lib/validations/task";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import type { MetadataInputValues } from "@/types/metadata";

type TaskInput = z.input<typeof taskCreateSchema>;
type TaskValues = z.output<typeof taskCreateSchema>;

export function TaskCreateForm({
  projectId,
  milestones,
  members,
  workflowStatuses,
  labels = [],
  metadataFields = [],
}: {
  projectId: string;
  milestones: Array<{ id: string; title: string }>;
  members: Array<{ id: string; name: string; discipline: string | null }>;
  workflowStatuses: Array<{ id: string; name: string; category: string; isInitial: boolean }>;
  labels?: Array<{ id: string; name: string }>;
  metadataFields?: MetadataFieldDefinition[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<MetadataInputValues>({});
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TaskInput, undefined, TaskValues>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      title: "",
      description: "",
      workflowStatusId: workflowStatuses.find(({ isInitial }) => isInitial)?.id,
      priority: "MEDIUM",
      estimatedHrs: undefined,
      requiredDiscipline: "",
      startDate: "",
      dueDate: "",
      milestoneId: null,
      assigneeIds: [],
      labelIds: [],
    },
  });
  const selectedAssigneeIds = useWatch({ control, name: "assigneeIds" }) ?? [];
  const requiredDiscipline = useWatch({ control, name: "requiredDiscipline" });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) dialog.showModal();
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  async function submit(values: TaskValues) {
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, ...(metadataFields.length ? { metadata } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Task couldn't be created.");
        return;
      }
      reset();
      setMetadata({});
      setDialogOpen(false);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setDialogOpen(true)}>
        <Plus aria-hidden="true" /> Add task
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`add-task-title-${projectId}`}
        onCancel={(event) => { if (isSubmitting) event.preventDefault(); }}
        onClose={() => { setDialogOpen(false); reset(); setMetadata({}); setError(""); }}
        className="fixed inset-0 m-auto max-h-[min(90vh,52rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-lg border border-border-default bg-surface p-0 text-text-primary shadow-lg backdrop:bg-neutral-900/40"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-default px-4 py-3 sm:px-5">
          <div>
            <h2 id={`add-task-title-${projectId}`} className="text-base font-semibold">Add task</h2>
            <p className="mt-1 text-xs text-text-muted">Define the work, ownership, and target schedule.</p>
          </div>
          <button type="button" disabled={isSubmitting} aria-label="Close add task dialog" onClick={() => setDialogOpen(false)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-primary disabled:opacity-50">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
      <form className="space-y-4 p-4 sm:p-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-text-secondary">Task title</span>
          <Input aria-invalid={Boolean(errors.title)} placeholder="Describe the next action" {...register("title")} />
          {errors.title && <span className="block text-xs text-error-dark">{errors.title.message}</span>}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Workflow status</span>
          <select className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("workflowStatusId")}>
            {workflowStatuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Priority</span>
          <select className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("priority")}>
            {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </label>
        {milestones.length > 0 && (
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-text-secondary">Milestone</span>
            <select className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("milestoneId", { setValueAs: (value) => value || null })}>
              <option value="">No milestone</option>
              {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
            </select>
          </label>
        )}
        {labels.length > 0 && (
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-text-secondary">Labels</span>
            <select multiple className="min-h-24 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm" {...register("labelIds")}>
              {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
            </select>
            <span className="block text-xs text-text-muted">Use Ctrl or Command to select more than one.</span>
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Required discipline</span>
          <Input placeholder="Optional" {...register("requiredDiscipline")} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Estimated hours</span>
          <Input
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            {...register("estimatedHrs", { setValueAs: (value) => value === "" ? undefined : Number(value) })}
          />
          {errors.estimatedHrs && <span className="block text-xs text-error-dark">{errors.estimatedHrs.message}</span>}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Start date</span>
          <Input type="date" {...register("startDate")} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Due date</span>
          <Input type="date" {...register("dueDate")} />
        </label>
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-xs font-semibold text-text-secondary">Assign members</legend>
          <div className="max-h-52 overflow-y-auto rounded-md border border-border-default bg-surface p-1">
            {members.map((member) => {
              const selected = selectedAssigneeIds.includes(member.id);
              const disciplineDiffers = Boolean(
                selected &&
                requiredDiscipline?.trim() &&
                requiredDiscipline?.trim().toLowerCase() !== (member.discipline ?? "").trim().toLowerCase(),
              );
              return (
                <label key={member.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-primary"
                    checked={selected}
                    onChange={(event) => {
                      const selectedIds = event.target.checked
                        ? [...selectedAssigneeIds, member.id]
                        : selectedAssigneeIds.filter((id) => id !== member.id);
                      setValue("assigneeIds", selectedIds, { shouldValidate: true, shouldDirty: true });
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{member.name}</span>
                  {member.discipline && <span className="shrink-0 text-xs text-text-muted">{member.discipline}</span>}
                  {disciplineDiffers && <span className="shrink-0 rounded-full bg-warning-light px-2 py-1 text-[11px] font-medium text-warning-dark">Discipline differs</span>}
                </label>
              );
            })}
            {members.length === 0 && <p className="px-3 py-4 text-sm text-text-muted">Invite members before assigning work.</p>}
          </div>
          <span className="block text-xs text-text-muted">Discipline differences are warnings; assignments remain allowed.</span>
        </fieldset>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-text-secondary">Description</span>
          <textarea rows={2} className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm" {...register("description")} />
        </label>
      </div>
      <MetadataFieldsEditor fields={metadataFields} values={metadata} onChange={(key, value) => setMetadata((current) => ({ ...current, [key]: value }))} />
      {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={isSubmitting} onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {isSubmitting ? "Adding..." : "Add task"}
          </Button>
        </div>
      </form>
      </dialog>
    </>
  );
}

export function TaskStatusControl({
  projectId,
  taskId,
  initialWorkflowStatusId,
  workflowStatuses,
  initialActualHrs,
  compact = false,
}: {
  projectId: string;
  taskId: string;
  initialWorkflowStatusId: string;
  workflowStatuses: Array<{ id: string; name: string; category: string }>;
  initialActualHrs?: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const statusMenuRef = useRef<HTMLDetailsElement>(null);
  const [workflowStatusId, setWorkflowStatusId] = useState(initialWorkflowStatusId);
  const [actualHrs, setActualHrs] = useState(initialActualHrs ?? 0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function updateStatus(nextWorkflowStatusId: string) {
    setError("");
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowStatusId: nextWorkflowStatusId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Task status couldn't be updated.");
        return;
      }
      setWorkflowStatusId(result.data.workflowStatusId);
      if (compact) statusMenuRef.current?.removeAttribute("open");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function updateActualHours() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actualHrs }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Actual hours couldn't be updated.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (compact) {
    return (
      <div className="space-y-1">
        <details ref={statusMenuRef}>
          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center text-[10px] font-medium text-brand-primary hover:underline [&::-webkit-details-marker]:hidden">Update</summary>
          <div className="mt-1 w-40 max-w-full rounded-md border border-border-default bg-surface p-1">
            <div role="group" aria-label="Choose task status" className="space-y-0.5">
              {workflowStatuses.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  disabled={saving}
                  aria-pressed={workflowStatusId === status.id}
                  onClick={() => void updateStatus(status.id)}
                  className="flex min-h-8 w-full items-center justify-between rounded px-1 text-left transition-colors duration-150 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <StatusBadge status={status.name} colorKey={status.category} />
                  {workflowStatusId === status.id && <span className="pr-1 text-[9px] text-text-muted">Current</span>}
                </button>
              ))}
            </div>
            <details className="mt-1 border-t border-border-default px-1 pt-1">
              <summary className="cursor-pointer text-[10px] font-medium text-text-secondary">Actual hours · {actualHrs} h</summary>
              <div className="mt-1 space-y-1.5 pb-1">
                <input type="number" min="0" step="0.25" aria-label="Actual hours" value={actualHrs} onChange={(event) => setActualHrs(Number(event.target.value))} className="min-h-9 w-full rounded-md border border-border-default px-2 text-xs" />
                <button type="button" disabled={saving} onClick={() => void updateActualHours()} className="min-h-8 w-full rounded-md border border-border-default text-[10px] font-semibold text-text-secondary disabled:opacity-60">Save hours</button>
              </div>
            </details>
          </div>
        </details>
        {error && <p role="alert" className="max-w-40 text-[10px] text-error-dark">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Task status</span>
        <select
          value={workflowStatusId}
          disabled={saving}
          onChange={(event) => void updateStatus(event.target.value)}
          className="min-h-11 rounded-md border border-border-default bg-surface px-2 text-xs text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15 disabled:opacity-60"
        >
          {workflowStatuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Actual hours</span>
        <input type="number" min="0" step="0.25" value={actualHrs} onChange={(event) => setActualHrs(Number(event.target.value))} className="min-h-11 w-full rounded-md border border-border-default px-2 text-xs" />
      </label>
      <button type="button" disabled={saving} onClick={() => void updateActualHours()} className="min-h-11 w-full rounded-md border border-border-default text-xs font-semibold text-text-secondary disabled:opacity-60">Save hours</button>
      {error && <p role="alert" className="mt-1 max-w-48 text-xs text-error-dark">{error}</p>}
    </div>
  );
}
