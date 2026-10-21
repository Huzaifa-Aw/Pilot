"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AllocationEditForm } from "@/components/forms/allocation-form";
import { Button } from "@/components/ui/button";

export type EditableAllocation = {
  id: string;
  memberId: string;
  weekStartDate: Date;
  plannedHrs: number;
  allocationPct: number;
  mode: string;
  notes: string | null;
  capacityHrsPerWeek: number;
};

export function AllocationControls({ allocation }: { allocation: EditableAllocation }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!window.confirm("Remove this weekly allocation?")) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/allocations/${allocation.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Allocation couldn't be removed.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <AllocationEditForm
        allocation={allocation}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" /> Edit
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => void remove()}>
          <Trash2 aria-hidden="true" /> Remove
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
