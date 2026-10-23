"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEPLOYMENT_STATUSES } from "@/lib/constants";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import { deploymentChecklistItemSchema, deploymentChecklistSchema, deploymentCreateSchema } from "@/lib/validations/deployment";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import type { MetadataInputValues } from "@/types/metadata";

type DeploymentInput = z.input<typeof deploymentCreateSchema>;
type DeploymentValues = z.output<typeof deploymentCreateSchema>;
type ChecklistItem = z.infer<typeof deploymentChecklistItemSchema>;
type FormValues = {
  memberIds: string[];
  projectId: string;
  title: string;
  deploymentType: string;
  location: string;
  country: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
};

export function DeploymentForm({
  members,
  projects,
  deploymentId,
  initialValues,
  initialChecklist,
  initialMetadata,
  metadataFields,
}: {
  members: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; code: string; title: string }>;
  deploymentId?: string;
  initialValues?: FormValues;
  initialChecklist?: unknown;
  initialMetadata: MetadataInputValues;
  metadataFields: MetadataFieldDefinition[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const parsedChecklist = deploymentChecklistSchema.safeParse(initialChecklist ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(parsedChecklist.success ? parsedChecklist.data : []);
  const [checklistError, setChecklistError] = useState(parsedChecklist.success ? "" : "The saved checklist could not be read. Add replacement items before saving.");
  const [metadataValues, setMetadataValues] = useState<MetadataInputValues>(initialMetadata);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeploymentInput, undefined, DeploymentValues>({
    resolver: zodResolver(deploymentCreateSchema),
    defaultValues: {
      memberIds: initialValues?.memberIds ?? (members[0] ? [members[0].id] : []),
      projectId: initialValues?.projectId ?? projects[0]?.id ?? "",
      title: initialValues?.title ?? "",
      deploymentType: initialValues?.deploymentType ?? "",
      location: initialValues?.location ?? "",
      country: initialValues?.country ?? "",
      startDate: initialValues?.startDate ?? "",
      endDate: initialValues?.endDate ?? "",
      status: (initialValues?.status ?? "UPCOMING") as DeploymentInput["status"],
      notes: initialValues?.notes ?? "",
    },
  });

  async function submit(values: DeploymentValues) {
    setError("");
    if (checklistError) {
      setError(checklistError);
      return;
    }
    const payload = {
      ...values,
      memberIds: values.memberIds ?? [],
      checklist,
      metadata: metadataValues,
    };
    try {
      const response = await fetch(deploymentId ? `/api/deployments/${deploymentId}` : "/api/deployments", {
        method: deploymentId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Deployment couldn't be saved.");
        return;
      }
      router.push(`/deployments/${result.data.id}`);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-secondary">Assigned members</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <label key={member.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border-default px-3 text-sm text-text-primary">
              <input type="checkbox" value={member.id} className="size-4 accent-brand-primary" {...register("memberIds")} />
              {member.name}
            </label>
          ))}
        </div>
        {errors.memberIds?.message && <p className="text-xs text-error-dark">{errors.memberIds.message}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" htmlFor="projectId" error={errors.projectId?.message}>
          <select id="projectId" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("projectId")}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="title" error={errors.title?.message}>
          <Input id="title" {...register("title")} />
        </Field>
        <Field label="Type" htmlFor="deploymentType" error={errors.deploymentType?.message}>
          <Input id="deploymentType" placeholder="On-site, remote, training…" {...register("deploymentType")} />
        </Field>
        <Field label="Site name or location" htmlFor="location" error={errors.location?.message}>
          <Input id="location" autoComplete="address-level2" {...register("location")} />
        </Field>
        <Field label="Country or region" htmlFor="country" error={errors.country?.message}>
          <Input id="country" autoComplete="country-name" {...register("country")} />
        </Field>
        <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message}>
          <Input id="startDate" type="date" {...register("startDate")} />
        </Field>
        <Field label="End date" htmlFor="endDate" error={errors.endDate?.message}>
          <Input id="endDate" type="date" {...register("endDate")} />
        </Field>
        <Field label="Status" htmlFor="status" error={errors.status?.message}>
          <select id="status" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("status")}>
            {DEPLOYMENT_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
        </Field>
      </div>
      <fieldset className="space-y-3 border-t border-border-default pt-5">
        <legend className="px-1 text-sm font-semibold text-text-primary">Checklist</legend>
        {checklistError && <p role="alert" className="text-sm text-error-dark">{checklistError}</p>}
        {checklist.length > 0 && <ul className="space-y-2">
          {checklist.map((item, index) => (
            <li key={item.id} className="grid gap-2 rounded-md border border-border-default p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-secondary">Checklist item {index + 1}</span>
                <Input maxLength={160} required value={item.label} onChange={(event) => setChecklist((items) => items.map((current) => current.id === item.id ? { ...current, label: event.target.value } : current))} />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" className="size-4 accent-brand-primary" checked={item.complete} onChange={(event) => setChecklist((items) => items.map((current) => current.id === item.id ? { ...current, complete: event.target.checked } : current))} />
                Complete
              </label>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove checklist item ${index + 1}`} onClick={() => {
                setChecklist((items) => items.filter((current) => current.id !== item.id));
                setChecklistError("");
              }}>
                <Trash2 aria-hidden="true" className="text-error-dark" />
              </Button>
            </li>
          ))}
        </ul>}
        <Button type="button" variant="secondary" disabled={checklist.length >= 100} onClick={() => {
          setChecklistError("");
          setChecklist((items) => [...items, { id: crypto.randomUUID(), label: "", complete: false }]);
        }}>
          <Plus aria-hidden="true" /> Add checklist item
        </Button>
      </fieldset>
      <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
        <textarea id="notes" rows={3} className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm" {...register("notes")} />
      </Field>
      <MetadataFieldsEditor
        fields={metadataFields}
        values={metadataValues}
        onChange={(key, value) => setMetadataValues((current) => ({ ...current, [key]: value }))}
      />
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      <Button type="submit" disabled={isSubmitting || !members.length || !projects.length}>
        {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        {isSubmitting ? "Saving..." : deploymentId ? "Save deployment" : "Schedule deployment"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">{label}</label>
      {children}
      {error && <p className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
