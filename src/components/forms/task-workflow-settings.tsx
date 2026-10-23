"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TASK_STATUSES } from "@/lib/constants";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";

type WorkflowStatus = {
  id?: string;
  key: string;
  name: string;
  category: TaskStatus;
  sortOrder: number;
  isInitial: boolean;
  isActive: boolean;
  requiredFieldKeys: string[];
};

type Workflow = {
  id: string;
  name: string;
  isDefault: boolean;
  statuses: WorkflowStatus[];
  transitions: Array<{ fromStatusId: string; toStatusId: string }>;
};

type WorkflowDraft = Omit<Workflow, "transitions"> & {
  transitions: Array<{ fromKey: string; toKey: string }>;
};

type TaskLabel = { id: string; name: string; color: string };
const builtInFields = [
  ["title", "Title", "Basics"],
  ["description", "Description", "Basics"],
  ["priority", "Priority", "Planning"],
  ["assigneeIds", "Assigned members", "People"],
  ["startDate", "Start date", "Planning"],
  ["dueDate", "Due date", "Planning"],
  ["estimatedHrs", "Estimated hours", "Planning"],
  ["actualHrs", "Actual hours", "Planning"],
  ["milestoneId", "Milestone", "Planning"],
  ["requiredDiscipline", "Required discipline", "Planning"],
] as const;
const labelColors = ["neutral", "blue", "green", "amber", "red"] as const;

function toDraft(workflow: Workflow): WorkflowDraft {
  const keys = new Map(workflow.statuses.map(({ id, key }) => [id, key]));
  return {
    ...workflow,
    statuses: [...workflow.statuses].sort((a, b) => a.sortOrder - b.sortOrder),
    transitions: workflow.transitions.flatMap(({ fromStatusId, toStatusId }) => {
      const fromKey = keys.get(fromStatusId);
      const toKey = keys.get(toStatusId);
      return fromKey && toKey ? [{ fromKey, toKey }] : [];
    }),
  };
}

function makeKey(name: string) {
  const key = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return key || `STATUS_${Date.now()}`;
}

export function TaskWorkflowSettings({
  initialWorkflows,
  initialLabels,
  metadataFields,
}: {
  initialWorkflows: Workflow[];
  initialLabels: TaskLabel[];
  metadataFields: MetadataFieldDefinition[];
}) {
  const [workflows] = useState(initialWorkflows);
  const [selectedId, setSelectedId] = useState(initialWorkflows[0]?.id ?? "");
  const selected = workflows.find(({ id }) => id === selectedId) ?? workflows[0];
  const [draft, setDraft] = useState<WorkflowDraft | null>(() => selected ? toDraft(selected) : null);
  const [labels, setLabels] = useState(initialLabels);
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<(typeof labelColors)[number]>("neutral");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const customFields = metadataFields.map((field) => ({
    key: field.key,
    label: field.label,
    section: field.section?.trim() || "Additional details",
  }));

  function chooseWorkflow(id: string) {
    const next = workflows.find((workflow) => workflow.id === id);
    if (!next) return;
    setSelectedId(id);
    setDraft(toDraft(next));
    setError("");
    setSuccess("");
  }

  async function addWorkflow() {
    const template = workflows.find(({ isDefault }) => isDefault) ?? workflows[0];
    if (!template) return;
    setPending(true);
    setError("");
    try {
      const copy = toDraft(template);
      const response = await fetch("/api/task-workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `New workflow ${workflows.length + 1}`,
          statuses: copy.statuses.map(({ key, name, category, sortOrder, isInitial, requiredFieldKeys }) => ({ key, name, category, sortOrder, isInitial, requiredFieldKeys })),
          transitions: copy.transitions,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Workflow couldn't be created.");
        return;
      }
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function saveWorkflow() {
    if (!draft) return;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/task-workflows/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          isDefault: draft.isDefault,
          statuses: draft.statuses.map((status, sortOrder) => ({ ...status, sortOrder })),
          transitions: draft.transitions,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Workflow couldn't be saved.");
        return;
      }
      setSuccess("Workflow saved.");
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function addStatus() {
    if (!draft || draft.statuses.length >= 30) return;
    const key = makeKey(`NEW_STATUS_${Date.now()}`);
    setDraft({
      ...draft,
      statuses: [...draft.statuses, {
        key,
        name: "New status",
        category: "IN_PROGRESS",
        sortOrder: draft.statuses.length,
        isInitial: false,
        isActive: true,
        requiredFieldKeys: [],
      }],
    });
  }

  function updateStatus(index: number, update: Partial<WorkflowStatus>) {
    if (!draft) return;
    setDraft({ ...draft, statuses: draft.statuses.map((status, itemIndex) => itemIndex === index ? { ...status, ...update } : status) });
  }

  function removeStatus(index: number) {
    if (!draft || draft.statuses.length <= 2) return;
    const removed = draft.statuses[index];
    const statuses = draft.statuses.filter((_, itemIndex) => itemIndex !== index);
    if (removed.isInitial) statuses[0] = { ...statuses[0], isInitial: true };
    setDraft({
      ...draft,
      statuses: statuses.map((status, sortOrder) => ({ ...status, sortOrder })),
      transitions: draft.transitions.filter(({ fromKey, toKey }) => fromKey !== removed.key && toKey !== removed.key),
    });
  }

  function reorderStatus(index: number, direction: -1 | 1) {
    if (!draft) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.statuses.length) return;
    const statuses = [...draft.statuses];
    [statuses[index], statuses[nextIndex]] = [statuses[nextIndex], statuses[index]];
    setDraft({ ...draft, statuses: statuses.map((status, sortOrder) => ({ ...status, sortOrder })) });
  }

  function toggleRequiredField(statusIndex: number, key: string) {
    if (!draft) return;
    const status = draft.statuses[statusIndex];
    const requiredFieldKeys = status.requiredFieldKeys.includes(key)
      ? status.requiredFieldKeys.filter((item) => item !== key)
      : [...status.requiredFieldKeys, key];
    updateStatus(statusIndex, { requiredFieldKeys });
  }

  function toggleTransition(fromKey: string, toKey: string) {
    if (!draft) return;
    const exists = draft.transitions.some((transition) => transition.fromKey === fromKey && transition.toKey === toKey);
    setDraft({
      ...draft,
      transitions: exists
        ? draft.transitions.filter((transition) => transition.fromKey !== fromKey || transition.toKey !== toKey)
        : [...draft.transitions, { fromKey, toKey }],
    });
  }

  async function createLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/task-labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newLabel, color: newLabelColor }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Label couldn't be created.");
        return;
      }
      setLabels((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLabel("");
      setSuccess("Label created.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  async function deleteLabel(label: TaskLabel) {
    setError("");
    try {
      const response = await fetch(`/api/task-labels/${label.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Label couldn't be deleted.");
        return;
      }
      setLabels((current) => current.filter(({ id }) => id !== label.id));
      setSuccess("Label deleted.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border-default bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-48 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-text-secondary">Workflow</span>
            <select value={selectedId} onChange={(event) => chooseWorkflow(event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
              {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}{workflow.isDefault ? " (default)" : ""}</option>)}
            </select>
          </label>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void addWorkflow()}>
            <Plus aria-hidden="true" /> Add workflow
          </Button>
        </div>
        {draft && (
          <>
            <label className="block max-w-xl space-y-1.5">
              <span className="text-sm font-medium text-text-secondary">Workflow name</span>
              <Input maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} className="size-4 accent-brand-primary" />
              Use as the default for new projects
            </label>

            <section className="space-y-3" aria-labelledby="workflow-statuses-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="workflow-statuses-title" className="text-sm font-semibold text-text-primary">Statuses and required fields</h2>
                  <p className="mt-1 text-xs text-text-muted">Choose a reporting category and the task fields required before moving into each status.</p>
                </div>
                <Button type="button" variant="secondary" disabled={draft.statuses.length >= 30} onClick={addStatus}><Plus aria-hidden="true" /> Add status</Button>
              </div>
              <ol className="space-y-3">
                {draft.statuses.map((status, index) => (
                  <li key={status.id ?? status.key} className="space-y-3 rounded-md border border-border-default p-3">
                    <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_12rem_auto] sm:items-end">
                      <div className="flex gap-1">
                        <Button type="button" size="icon" variant="ghost" aria-label={`Move ${status.name} up`} disabled={index === 0} onClick={() => reorderStatus(index, -1)}><ArrowUp aria-hidden="true" /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Move ${status.name} down`} disabled={index === draft.statuses.length - 1} onClick={() => reorderStatus(index, 1)}><ArrowDown aria-hidden="true" /></Button>
                      </div>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-text-secondary">Status name</span>
                        <Input maxLength={80} value={status.name} onChange={(event) => updateStatus(index, { name: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-text-secondary">Reporting category</span>
                        <select value={status.category} onChange={(event) => updateStatus(index, { category: event.target.value as TaskStatus })} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
                          {TASK_STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                        </select>
                      </label>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${status.name}`} disabled={draft.statuses.length <= 2} onClick={() => removeStatus(index)}><Trash2 aria-hidden="true" className="text-error-dark" /></Button>
                    </div>
                    <label className="flex min-h-10 items-center gap-2 text-xs font-medium text-text-secondary">
                      <input type="radio" name={`initial-${draft.id}`} checked={status.isInitial} onChange={() => setDraft({ ...draft, statuses: draft.statuses.map((item, itemIndex) => ({ ...item, isInitial: itemIndex === index })) })} className="size-4 accent-brand-primary" />
                      Starting status
                    </label>
                    <div className="grid gap-3 border-t border-border-default pt-3 md:grid-cols-3">
                      {[...builtInFields.map(([key, label, section]) => ({ key, label, section })), ...customFields].map((field) => (
                        <label key={field.key} className="flex min-h-9 items-start gap-2 text-xs text-text-secondary">
                          <input type="checkbox" checked={status.requiredFieldKeys.includes(field.key)} onChange={() => toggleRequiredField(index, field.key)} className="mt-0.5 size-4 shrink-0 accent-brand-primary" />
                          <span><span className="block font-medium">{field.label}</span><span className="text-text-muted">{field.section}</span></span>
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="space-y-3 border-t border-border-default pt-4" aria-labelledby="workflow-transitions-title">
              <div>
                <h2 id="workflow-transitions-title" className="text-sm font-semibold text-text-primary">Allowed transitions</h2>
                <p className="mt-1 text-xs text-text-muted">Select which next statuses are available from each status.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[36rem] border-collapse text-left text-xs">
                  <thead><tr><th className="sticky left-0 bg-surface px-2 py-2">From / To</th>{draft.statuses.map((status) => <th key={status.key} className="px-2 py-2">{status.name}</th>)}</tr></thead>
                  <tbody className="divide-y divide-border-default">
                    {draft.statuses.map((from) => <tr key={from.key}>
                      <th scope="row" className="sticky left-0 bg-surface px-2 py-2 font-medium">{from.name}</th>
                      {draft.statuses.map((to) => <td key={to.key} className="px-2 py-2 text-center">
                        {from.key !== to.key && <input type="checkbox" aria-label={`${from.name} to ${to.name}`} checked={draft.transitions.some((transition) => transition.fromKey === from.key && transition.toKey === to.key)} onChange={() => toggleTransition(from.key, to.key)} className="size-4 accent-brand-primary" />}
                      </td>)}
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </section>
            <Button type="button" disabled={pending || !draft.name.trim()} onClick={() => void saveWorkflow()}>{pending ? "Saving..." : "Save workflow"}</Button>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border-default bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Task labels</h2>
          <p className="mt-1 text-sm text-text-muted">Create reusable labels for organizing and filtering tasks.</p>
        </div>
        <form onSubmit={(event) => void createLabel(event)} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
          <Input aria-label="Label name" maxLength={40} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Label name" required />
          <select aria-label="Label color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value as (typeof labelColors)[number])} className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-sm">
            {labelColors.map((color) => <option key={color} value={color}>{color}</option>)}
          </select>
          <Button type="submit"><Plus aria-hidden="true" /> Add label</Button>
        </form>
        {labels.length ? <ul className="flex flex-wrap gap-2">{labels.map((label) => (
          <li key={label.id} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border-default px-3 text-xs">
            <span>{label.name}</span>
            <button type="button" aria-label={`Delete ${label.name} label`} onClick={() => void deleteLabel(label)} className="text-error-dark hover:underline">Delete</button>
          </li>
        ))}</ul> : <p className="text-sm text-text-muted">No labels yet.</p>}
      </section>
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      {success && <p role="status" className="text-sm text-success-dark">{success}</p>}
    </div>
  );
}
