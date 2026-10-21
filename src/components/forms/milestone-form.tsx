"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  completionPct: number;
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
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-3 rounded-md border border-border-default bg-neutral-50 p-3" onSubmit={handleSubmit(submit)} noValidate>
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
      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {isSubmitting ? "Adding..." : "Add milestone"}
      </Button>
    </form>
  );
}

export function MilestoneStatusControl({
  projectId,
  milestone,
  members,
}: {
  projectId: string;
  milestone: MilestoneOption;
  members: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
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
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
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
