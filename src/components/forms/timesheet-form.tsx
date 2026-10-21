"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timesheetCreateSchema } from "@/lib/validations/timesheet";

type TimesheetInput = z.input<typeof timesheetCreateSchema>;
type TimesheetValues = z.output<typeof timesheetCreateSchema>;

type TimesheetRecord = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  weekStartDate: Date;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  notes: string | null;
};

const days = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
] as const;

export function TimesheetForm({
  projects,
  initialWeek,
  entry,
}: {
  projects: Array<{ id: string; code: string; title: string }>;
  initialWeek: string;
  entry?: TimesheetRecord;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TimesheetInput, undefined, TimesheetValues>({
    resolver: zodResolver(timesheetCreateSchema),
    defaultValues: {
      projectId: entry?.projectId ?? projects[0]?.id ?? "",
      milestoneId: entry?.milestoneId ?? null,
      weekStartDate: entry?.weekStartDate.toISOString().slice(0, 10) ?? initialWeek,
      monday: entry?.monday ?? 0,
      tuesday: entry?.tuesday ?? 0,
      wednesday: entry?.wednesday ?? 0,
      thursday: entry?.thursday ?? 0,
      friday: entry?.friday ?? 0,
      notes: entry?.notes ?? "",
    },
  });
  const dayValues = useWatch({ control, name: ["monday", "tuesday", "wednesday", "thursday", "friday"] });
  const total = dayValues.reduce<number>((sum, value) => sum + (Number(value) || 0), 0);

  async function submit(values: TimesheetValues) {
    setError("");
    try {
      const response = await fetch(entry ? `/api/timesheets/${entry.id}` : "/api/timesheets", {
        method: entry ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Timesheet couldn't be saved.");
        return;
      }
      router.replace("/timesheets");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-text-secondary">Project</span>
          <select disabled={Boolean(entry)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm disabled:bg-neutral-100" {...register("projectId")}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
          </select>
          {errors.projectId && <span className="block text-xs text-error-dark">{errors.projectId.message}</span>}
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-text-secondary">Week starts (Monday)</span>
          <Input type="date" disabled={Boolean(entry)} aria-invalid={Boolean(errors.weekStartDate)} {...register("weekStartDate")} />
          {errors.weekStartDate && <span className="block text-xs text-error-dark">{errors.weekStartDate.message}</span>}
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-text-primary">Hours by day</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {days.map(([key, label]) => (
            <label key={key} className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">{label}</span>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.25"
                inputMode="decimal"
                aria-invalid={Boolean(errors[key])}
                {...register(key, { valueAsNumber: true })}
              />
              {errors[key] && <span className="block text-xs text-error-dark">{errors[key]?.message}</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Notes</span>
        <textarea rows={3} className="w-full rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15" {...register("notes")} />
      </label>
      <div className="flex items-center justify-between rounded-md bg-neutral-50 px-4 py-3">
        <span className="text-sm font-medium text-text-secondary">Total for the week</span>
        <span className="text-base font-semibold tabular-nums text-text-primary">{total.toFixed(2)} hrs</span>
      </div>
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" variant="primary" disabled={isSubmitting || !projects.length}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : entry ? <Save aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          {isSubmitting ? "Saving..." : entry ? "Save timesheet" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}

export function TimesheetActions({
  id,
  status,
  canSubmit,
  canReview,
}: {
  id: string;
  status: string;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function update(nextStatus: "SUBMITTED" | "APPROVED" | "FLAGGED") {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Timesheet status couldn't be updated.");
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canSubmit && (status === "DRAFT" || status === "FLAGGED") && (
          <Button size="sm" disabled={pending} onClick={() => void update("SUBMITTED")}>
            Submit
          </Button>
        )}
        {canReview && status === "SUBMITTED" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => void update("APPROVED")}>Approve</Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => void update("FLAGGED")}>Flag</Button>
          </>
        )}
      </div>
      {error && <p role="alert" className="max-w-xs text-xs text-error-dark">{error}</p>}
    </div>
  );
}
