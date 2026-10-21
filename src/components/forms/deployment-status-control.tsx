"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEPLOYMENT_STATUSES } from "@/lib/constants";

export function DeploymentStatusControl({
  id,
  initialStatus,
}: {
  id: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/deployments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Deployment couldn't be updated.");
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
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Deployment status</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
          {DEPLOYMENT_STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void save()}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        Save status
      </Button>
      {error && <p role="alert" className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
