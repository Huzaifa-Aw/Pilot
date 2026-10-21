"use client";

import { LoaderCircle, RotateCcw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Checkout = {
  id: string;
  checkedOutAt: Date;
  notes: string | null;
  member: { id: string; user: { name: string | null; email: string } };
  project: { id: string; code: string; title: string } | null;
  deployment: { id: string; title: string | null; location: string } | null;
};

export function AssetCheckoutForm({
  assetId,
  activeCheckout,
  members,
  projects,
  deployments,
  canManage,
  canCheckout,
}: {
  assetId: string;
  activeCheckout: Checkout | null;
  members: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; code: string; title: string }>;
  deployments: Array<{ id: string; title: string | null; location: string; projectId: string }>;
  canManage: boolean;
  canCheckout: boolean;
}) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [deploymentId, setDeploymentId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(action: "checkout" | "return") {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/assets/${assetId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "return"
          ? { action }
          : { action, memberId, projectId: projectId || null, deploymentId: deploymentId || null, notes: notes || null }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "The asset checkout couldn't be updated.");
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
    <section aria-labelledby="asset-checkout-title" className="space-y-3 rounded-lg border border-border-default bg-surface p-4 sm:p-5">
      <div>
        <h2 id="asset-checkout-title" className="font-heading text-base font-semibold text-text-primary">Availability</h2>
        <p className="mt-1 text-sm text-text-muted">Check out an asset to record who has it and which project it supports.</p>
      </div>
      {activeCheckout ? (
        <div className="flex flex-col gap-3 rounded-md bg-neutral-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-text-primary">
              Held by {activeCheckout.member.user.name ?? activeCheckout.member.user.email}
            </p>
            <p className="mt-1 text-text-muted">
              {activeCheckout.project ? `${activeCheckout.project.code} · ${activeCheckout.project.title} · ` : ""}
              {activeCheckout.deployment ? `${activeCheckout.deployment.title ?? activeCheckout.deployment.location} · ` : ""}
              Checked out {activeCheckout.checkedOutAt.toLocaleDateString()}
            </p>
            {activeCheckout.notes && <p className="mt-1 text-text-muted">{activeCheckout.notes}</p>}
          </div>
          {canManage && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => void submit("return")}>
              {pending ? <LoaderCircle aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
              Return asset
            </Button>
          )}
        </div>
      ) : canManage ? (
        canCheckout ? (
          members.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-text-secondary">
              Assigned member
              <select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-text-secondary">
              Project (optional)
              <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setDeploymentId(""); }} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
                <option value="">No project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-text-secondary">
              Deployment (optional)
              <select value={deploymentId} onChange={(event) => {
                setDeploymentId(event.target.value);
                const deployment = deployments.find((item) => item.id === event.target.value);
                if (deployment) setProjectId(deployment.projectId);
              }} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
                <option value="">No deployment</option>
                {deployments.map((deployment) => <option key={deployment.id} value={deployment.id}>{deployment.title ?? deployment.location}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-text-secondary sm:col-span-2">
              Checkout notes (optional)
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={2} className="w-full rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm" />
            </label>
            {error && <p role="alert" className="text-sm text-error-dark sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="button" disabled={pending} onClick={() => void submit("checkout")}>
                {pending ? <LoaderCircle aria-hidden="true" /> : <Wrench aria-hidden="true" />}
                Check out asset
              </Button>
            </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Add an active organization member before checking out this asset.</p>
          )
        ) : (
          <p className="text-sm text-text-muted">This asset&apos;s status doesn&apos;t allow checkout.</p>
        )
      ) : (
        <p className="text-sm text-text-muted">{canCheckout ? "This asset is available." : "This asset is not available for checkout."}</p>
      )}
      {activeCheckout && error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
    </section>
  );
}
