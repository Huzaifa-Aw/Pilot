"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MilestoneStatus } from "@prisma/client";
import { LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import { milestoneCreateSchema } from "@/lib/validations/milestone";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import type { MetadataInputValues } from "@/types/metadata";

type MilestoneInput = z.input<typeof milestoneCreateSchema>;
type MilestoneValues = z.output<typeof milestoneCreateSchema>;

export type MilestoneOption = {
  id: string;
  title: string;
  sequenceNumber: number;
  status: string;
  targetDate: Date | null;
  requiresSignoff: boolean;
  signoffByMemberId: string | null;
};

export function MilestoneCreateForm({
  projectId,
  metadataFields = [],
}: {
  projectId: string;
  metadataFields?: MetadataFieldDefinition[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [metadataValues, setMetadataValues] = useState<MetadataInputValues>({});
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<MilestoneInput, undefined, MilestoneValues>({
    resolver: zodResolver(milestoneCreateSchema),
    defaultValues: { title: "", description: "", startDate: "", targetDate: "", requiresSignoff: false },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) dialog.showModal();
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  async function submit(values: MilestoneValues) {
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(metadataFields.length ? { metadata: metadataValues } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Milestone couldn't be created.");
        return;
      }
      reset();
      setMetadataValues({});
      setDialogOpen(false);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setDialogOpen(true)}>
        <Plus aria-hidden="true" /> Add milestone
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`add-milestone-title-${projectId}`}
        onCancel={(event) => { if (isSubmitting) event.preventDefault(); }}
        onClose={() => { setDialogOpen(false); reset(); setMetadataValues({}); setError(""); }}
        className="fixed inset-0 m-auto max-h-[min(90vh,42rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-border-default bg-surface p-0 text-text-primary shadow-lg backdrop:bg-neutral-900/40"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-default px-4 py-3 sm:px-5">
          <div>
            <h2 id={`add-milestone-title-${projectId}`} className="text-base font-semibold">Add milestone</h2>
            <p className="mt-1 text-xs text-text-muted">Set a project checkpoint and its target date.</p>
          </div>
          <button type="button" disabled={isSubmitting} aria-label="Close add milestone dialog" onClick={() => setDialogOpen(false)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-primary disabled:opacity-50">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
      <form className="space-y-3 p-4 sm:p-5" onSubmit={handleSubmit(submit)} noValidate>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-text-secondary">Milestone title</span>
        <Input aria-invalid={Boolean(errors.title)} placeholder="Name this checkpoint" {...register("title")} />
        {errors.title && <span className="block text-xs text-error-dark">{errors.title.message}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Start date</span>
          <Input type="date" {...register("startDate")} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Target date</span>
          <Input type="date" {...register("targetDate")} />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-text-secondary">
          <input type="checkbox" className="size-4 accent-brand-primary" {...register("requiresSignoff")} />
          Requires member signoff
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-text-secondary">Description</span>
        <textarea rows={2} className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15" {...register("description")} />
      </label>
      <MetadataFieldsEditor
        fields={metadataFields}
        values={metadataValues}
        onChange={(key, value) => setMetadataValues((current) => ({ ...current, [key]: value }))}
      />
      {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={isSubmitting} onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {isSubmitting ? "Adding..." : "Add milestone"}
          </Button>
        </div>
      </form>
      </dialog>
    </>
  );
}

export function MilestoneStatusControl({
  projectId,
  milestone,
  members,
  compact = false,
}: {
  projectId: string;
  milestone: MilestoneOption;
  members: Array<{ id: string; name: string }>;
  compact?: boolean;
}) {
  const router = useRouter();
  const statusMenuRef = useRef<HTMLDetailsElement>(null);
  const [status, setStatus] = useState(milestone.status);
  const [signoffByMemberId, setSignoffByMemberId] = useState(milestone.signoffByMemberId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function updateStatus(nextStatus: string) {
    setError("");
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          ...(signoffByMemberId ? { signoffByMemberId } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Milestone couldn't be updated.");
        return;
      }
      setStatus(result.data.status);
      if (compact) statusMenuRef.current?.removeAttribute("open");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (compact) {
    const statuses: Array<{ value: MilestoneStatus; label: string }> = [
      { value: MilestoneStatus.PLANNED, label: "Planned" },
      { value: MilestoneStatus.IN_PROGRESS, label: "In progress" },
      { value: MilestoneStatus.UNDER_REVIEW, label: "Under review" },
      { value: MilestoneStatus.APPROVED, label: "Approved" },
      { value: MilestoneStatus.COMPLETED, label: "Completed" },
    ];
    return (
      <div className="space-y-1">
        <details ref={statusMenuRef}>
          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center text-[10px] font-medium text-brand-primary hover:underline [&::-webkit-details-marker]:hidden">Update</summary>
          <div className="mt-1 w-48 max-w-full rounded-md border border-border-default bg-surface p-2">
            {milestone.requiresSignoff && (
              <label className="mb-2 block space-y-1">
                <span className="text-[10px] font-medium text-text-secondary">Signoff member</span>
                <select
                  value={signoffByMemberId}
                  onChange={(event) => setSignoffByMemberId(event.target.value)}
                  className="min-h-9 w-full rounded-md border border-border-default bg-surface px-2 text-[10px]"
                >
                  <option value="">Select before approval</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
            )}
            <div role="group" aria-label="Choose milestone status" className="space-y-0.5">
              {statuses.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={saving}
                  aria-pressed={status === item.value}
                  onClick={() => void updateStatus(item.value)}
                  className="flex min-h-8 w-full items-center justify-between rounded px-1 text-left transition-colors duration-150 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <StatusBadge status={item.label} colorKey={item.value} />
                  {status === item.value && <span className="pr-1 text-[9px] text-text-muted">Current</span>}
                </button>
              ))}
            </div>
          </div>
        </details>
        {error && <p role="alert" className="max-w-48 text-[10px] text-error-dark">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {milestone.requiresSignoff && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Signoff member</span>
          <select
            value={signoffByMemberId}
            onChange={(event) => setSignoffByMemberId(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border-default bg-surface px-2 text-xs focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15"
          >
            <option value="">Select member before approval</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="sr-only">Milestone status</span>
        <select
          value={status}
          disabled={saving}
          onChange={(event) => void updateStatus(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border-default bg-surface px-2 text-xs text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15 disabled:opacity-60"
        >
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="UNDER_REVIEW">Under review</option>
          <option value="APPROVED">Approved</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </label>
      {error && <p role="alert" className="max-w-xs text-xs text-error-dark">{error}</p>}
    </div>
  );
}
