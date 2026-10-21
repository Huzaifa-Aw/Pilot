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

type MemberOption = { id: string; name: string; capacityHrsPerWeek: number };
type CreateInput = z.input<typeof allocationCreateSchema>;
type CreateValues = z.output<typeof allocationCreateSchema>;
type UpdateInput = z.input<typeof allocationUpdateSchema>;
type UpdateValues = z.output<typeof allocationUpdateSchema>;

export function AllocationCreateForm({
  projectId,
  members,
  weekStartDate,
}: {
  projectId: string;
  members: MemberOption[];
  weekStartDate: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
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
      weekStartDate,
      plannedHrs: 0,
      allocationPct: 0,
      mode: "Remote",
      notes: "",
    },
  });
  const selectedMemberId = useWatch({ control, name: "memberId" });
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const percentage = useWatch({ control, name: "allocationPct" }) ?? 0;

  async function submit(values: CreateValues) {
    setError("");
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
      reset({ memberId: values.memberId, weekStartDate, plannedHrs: 0, allocationPct: 0, mode: "Remote", notes: "" });
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
              setValue("plannedHrs", member ? member.capacityHrsPerWeek * (percentage || 0) / 100 : 0, { shouldValidate: true });
            },
          })}
        >
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        {errors.memberId && <span className="block text-xs text-error-dark">{errors.memberId.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Week starts</span>
        <Input type="date" {...register("weekStartDate")} />
        {errors.weekStartDate && <span className="block text-xs text-error-dark">{errors.weekStartDate.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Allocation (%)</span>
        <Input
          type="number"
          min="0"
          max="100"
          step="1"
          inputMode="numeric"
          {...register("allocationPct", {
            valueAsNumber: true,
            onChange: (event) => {
              const member = members.find((item) => item.id === selectedMemberId);
              setValue("plannedHrs", member ? member.capacityHrsPerWeek * Number(event.target.value || 0) / 100 : 0);
            },
          })}
        />
        {errors.allocationPct && <span className="block text-xs text-error-dark">{errors.allocationPct.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Planned hours</span>
        <Input readOnly type="number" value={selectedMember ? (selectedMember.capacityHrsPerWeek * Number(percentage || 0) / 100).toFixed(1) : "0"} aria-label="Planned hours calculated from capacity" />
        <span className="block text-xs text-text-muted">Calculated from member capacity.</span>
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
  const {
    register,
    handleSubmit,
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

  async function submit(values: UpdateValues) {
    setError("");
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
      router.refresh();
      onCancel?.();
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
        <Input type="number" min="0" max="100" step="1" {...register("allocationPct", { valueAsNumber: true })} />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-secondary">Planned hours</span>
        <Input type="number" min="0" max={allocation.capacityHrsPerWeek} step="0.5" {...register("plannedHrs", { valueAsNumber: true })} />
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
    </form>
  );
}
