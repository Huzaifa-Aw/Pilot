"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allocationCreateSchema, allocationUpdateSchema } from "@/lib/validations/allocation";
import { percentageFromPlannedHours, plannedHoursFromPercentage } from "@/lib/allocation-planning";

type MemberOption = { id: string; name: string; capacityHrsPerWeek: number };
type CreateInput = z.input<typeof allocationCreateSchema>;
type CreateValues = z.output<typeof allocationCreateSchema>;
type UpdateInput = z.input<typeof allocationUpdateSchema>;
type UpdateValues = z.output<typeof allocationUpdateSchema>;

export function AllocationCreateForm({
  projectId,
  members,
  startDate,
  endDate,
}: {
  projectId: string;
  members: MemberOption[];
  startDate: string;
  endDate: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateInput, undefined, CreateValues>({
    resolver: zodResolver(allocationCreateSchema),
    defaultValues: {
      memberId: members[0]?.id ?? "",
      startDate,
      endDate,
      plannedHrs: 0,
      allocationPct: 0,
      mode: "Remote",
      notes: "",
    },
  });
  const selectedMemberId = useWatch({ control, name: "memberId" });
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const percentage = useWatch({ control, name: "allocationPct" }) ?? 0;
  const plannedHours = useWatch({ control, name: "plannedHrs" }) ?? 0;

  function updateHoursFromPercentage(value: number, capacity: number) {
    setValue("allocationPct", value, { shouldValidate: true, shouldDirty: true });
    setValue("plannedHrs", plannedHoursFromPercentage(value, capacity), { shouldValidate: true, shouldDirty: true });
  }

  function updatePercentageFromHours(value: number, capacity: number) {
    setValue("plannedHrs", value, { shouldValidate: true, shouldDirty: true });
    setValue("allocationPct", percentageFromPlannedHours(value, capacity), { shouldValidate: true, shouldDirty: true });
  }

  async function submit(values: CreateValues) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/projects/${projectId}/allocations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Allocation couldn't be saved.");
        return;
      }
      reset({ memberId: values.memberId, startDate, endDate, plannedHrs: 0, allocationPct: 0, mode: "Remote", notes: "" });
      setSuccess(`${result.data.length} weekly allocation${result.data.length === 1 ? "" : "s"} scheduled.`);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-2 xl:grid-cols-5" onSubmit={handleSubmit(submit)} noValidate>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Member</span>
        <select
          className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"
          {...register("memberId", {
            onChange: (event) => {
              const member = members.find((item) => item.id === event.target.value);
              updateHoursFromPercentage(percentage, member?.capacityHrsPerWeek ?? 0);
            },
          })}
        >
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        {errors.memberId && <span className="block text-xs text-error-dark">{errors.memberId.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Allocation starts</span>
        <Input type="date" {...register("startDate")} />
        {errors.startDate && <span className="block text-xs text-error-dark">{errors.startDate.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Allocation ends</span>
        <Input type="date" {...register("endDate")} />
        {errors.endDate && <span className="block text-xs text-error-dark">{errors.endDate.message}</span>}
      </label>
      <p className="text-xs leading-5 text-text-muted sm:col-span-2 xl:col-span-5">The allocation applies to every week touched by these dates. Choose up to 12 weeks; each week is checked against the member&apos;s available capacity.</p>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Allocation (%)</span>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="numeric"
          value={percentage}
          onChange={(event) => updateHoursFromPercentage(Number(event.target.value || 0), selectedMember?.capacityHrsPerWeek ?? 0)}
        />
        {errors.allocationPct && <span className="block text-xs text-error-dark">{errors.allocationPct.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Planned hours</span>
        <Input type="number" min="0" max={selectedMember?.capacityHrsPerWeek ?? 168} step="0.25" value={plannedHours} onChange={(event) => updatePercentageFromHours(Number(event.target.value || 0), selectedMember?.capacityHrsPerWeek ?? 0)} aria-label="Planned hours" />
        <span className="block text-xs text-text-muted">Changing hours updates the percentage using this member&apos;s weekly capacity.</span>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Work mode</span>
        <select className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("mode")}>
          <option value="Remote">Remote</option>
          <option value="On-Site">On-site</option>
          <option value="Hybrid">Hybrid</option>
        </select>
      </label>
      <div className="sm:col-span-2 xl:col-span-full">
        {error && <p role="alert" className="mb-3 rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
        {success && <p role="status" className="mb-3 text-sm text-success-dark">{success}</p>}
        <Button type="submit" disabled={isSubmitting || members.length === 0}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isSubmitting ? "Saving..." : "Save allocation"}
        </Button>
      </div>
    </form>
  );
}

export function AllocationEditForm({
  allocation,
  onCancel,
}: {
  allocation: {
    id: string;
    memberId: string;
    weekStartDate: Date;
    plannedHrs: number;
    allocationPct: number;
    mode: string;
    notes: string | null;
    capacityHrsPerWeek: number;
  };
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateInput, undefined, UpdateValues>({
    resolver: zodResolver(allocationUpdateSchema),
    defaultValues: {
      weekStartDate: allocation.weekStartDate.toISOString().slice(0, 10),
      plannedHrs: allocation.plannedHrs,
      allocationPct: allocation.allocationPct,
      mode: allocation.mode as "Remote" | "On-Site" | "Hybrid",
      notes: allocation.notes ?? "",
    },
  });
  const plannedHours = useWatch({ control, name: "plannedHrs" }) ?? allocation.plannedHrs;
  const percentage = useWatch({ control, name: "allocationPct" }) ?? allocation.allocationPct;

  function updateHoursFromPercentage(value: number) {
    setValue("allocationPct", value, { shouldValidate: true, shouldDirty: true });
    setValue("plannedHrs", plannedHoursFromPercentage(value, allocation.capacityHrsPerWeek), { shouldValidate: true, shouldDirty: true });
  }

  function updatePercentageFromHours(value: number) {
    setValue("plannedHrs", value, { shouldValidate: true, shouldDirty: true });
    setValue("allocationPct", percentageFromPlannedHours(value, allocation.capacityHrsPerWeek), { shouldValidate: true, shouldDirty: true });
  }

  async function submit(values: UpdateValues) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/allocations/${allocation.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Allocation couldn't be updated.");
        return;
      }
      setSuccess("Allocation updated.");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(submit)} noValidate>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-secondary">Week starts</span>
        <Input type="date" {...register("weekStartDate")} />
        {errors.weekStartDate && <span className="block text-xs text-error-dark">{errors.weekStartDate.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-secondary">Allocation (%)</span>
        <Input type="number" min="0" max="100" step="0.01" value={percentage} onChange={(event) => updateHoursFromPercentage(Number(event.target.value || 0))} />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-secondary">Planned hours</span>
        <Input type="number" min="0" max={allocation.capacityHrsPerWeek} step="0.25" value={plannedHours} onChange={(event) => updatePercentageFromHours(Number(event.target.value || 0))} />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-secondary">Work mode</span>
        <select className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("mode")}>
          <option value="Remote">Remote</option>
          <option value="On-Site">On-site</option>
          <option value="Hybrid">Hybrid</option>
        </select>
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          Save
        </Button>
        {onCancel && <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
      {error && <p role="alert" className="text-xs text-error-dark sm:col-span-2">{error}</p>}
      {success && <p role="status" className="text-xs text-success-dark sm:col-span-2">{success}</p>}
    </form>
  );
}
