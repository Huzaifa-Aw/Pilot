"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import { PROJECT_STATUSES } from "@/lib/constants";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import { projectCreateSchema } from "@/lib/validations/project";
import type { MetadataInputValues } from "@/types/metadata";

type ProjectFormInput = z.input<typeof projectCreateSchema>;
type ProjectValues = z.output<typeof projectCreateSchema>;

export type EditableProject = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: ProjectValues["status"];
  startDate: Date | null;
  endDate: Date | null;
  budgetHours: number | null;
  tags: string[];
};

export function ProjectForm({
  project,
  metadataFields = [],
  initialMetadata = {},
}: {
  project?: EditableProject;
  metadataFields?: MetadataFieldDefinition[];
  initialMetadata?: MetadataInputValues;
}) {
  const router = useRouter();
  const [requestError, setRequestError] = useState("");
  const [metadataValues, setMetadataValues] = useState<MetadataInputValues>(initialMetadata);
  const [metadataChanged, setMetadataChanged] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormInput, undefined, ProjectValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      code: project?.code ?? "",
      title: project?.title ?? "",
      description: project?.description ?? "",
      status: project?.status ?? "PLANNING",
      startDate: project?.startDate?.toISOString().slice(0, 10) ?? "",
      endDate: project?.endDate?.toISOString().slice(0, 10) ?? "",
      budgetHours: project?.budgetHours ?? "",
      tags: project?.tags.join(", ") ?? "",
    },
  });

  async function submit(values: ProjectValues) {
    setRequestError("");
    try {
      const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(metadataFields.length && (!project || metadataChanged) ? { metadata: metadataValues } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setRequestError(result.error ?? "Project couldn't be saved. Check the details and try again.");
        return;
      }

      router.push(project ? `/projects/${project.id}` : `/projects/${result.data.id}`);
      router.refresh();
    } catch {
      setRequestError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Project code" htmlFor="code" error={errors.code?.message}>
          <Input
            id="code"
            autoComplete="off"
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? "code-error" : "code-help"}
            {...register("code")}
          />
          <p id="code-help" className="text-xs text-text-muted">Use a short, unique code for quick reference.</p>
        </Field>
        <Field label="Project name" htmlFor="title" error={errors.title?.message}>
          <Input id="title" aria-invalid={Boolean(errors.title)} {...register("title")} />
        </Field>
        <Field label="Status" htmlFor="status" error={errors.status?.message}>
          <select
            id="status"
            className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15"
            {...register("status")}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
            ))}
          </select>
        </Field>
        <Field label="Budgeted hours" htmlFor="budgetHours" error={errors.budgetHours?.message}>
          <Input
            id="budgetHours"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            {...register("budgetHours", {
              setValueAs: (value) => value === "" ? "" : Number(value),
            })}
          />
        </Field>
        <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message}>
          <Input id="startDate" type="date" {...register("startDate")} />
        </Field>
        <Field label="Target end date" htmlFor="endDate" error={errors.endDate?.message}>
          <Input id="endDate" type="date" {...register("endDate")} />
        </Field>
      </div>
      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <textarea
          id="description"
          rows={4}
          className="w-full resize-y rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-neutral-400 focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15"
          placeholder="What is this project aiming to deliver?"
          {...register("description")}
        />
      </Field>
      <Field label="Tags" htmlFor="tags" error={errors.tags?.message}>
        <Input
          id="tags"
          placeholder="Planning, internal, priority"
          aria-describedby="tags-help"
          {...register("tags")}
        />
        <p id="tags-help" className="text-xs text-text-muted">Separate tags with commas.</p>
      </Field>
      <MetadataFieldsEditor
        fields={metadataFields}
        values={metadataValues}
        onChange={(key, value) => {
          setMetadataChanged(true);
          setMetadataValues((current) => ({ ...current, [key]: value }));
        }}
      />
      {requestError && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{requestError}</p>}
      <div className="flex flex-col-reverse gap-3 border-t border-border-default pt-5 sm:flex-row sm:justify-between">
        <Link href={project ? `/projects/${project.id}` : "/projects"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-text-secondary transition-colors duration-150 hover:bg-neutral-100">
          <ArrowLeft size={16} aria-hidden="true" /> Cancel
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isSubmitting ? "Saving..." : project ? "Save changes" : "Create project"}
        </Button>
      </div>
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
  const errorId = `${htmlFor}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">{label}</label>
      {children}
      {error && <p id={errorId} className="text-sm text-error-dark">{error}</p>}
    </div>
  );
}
