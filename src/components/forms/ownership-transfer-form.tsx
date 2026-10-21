"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OwnershipTransferForm({
  organizationId,
  members,
}: {
  organizationId: string;
  members: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function transfer() {
    if (!memberId || !window.confirm("Transfer ownership? Your organization role will become Admin.")) return;
    setError("");
    setSuccess("");
    setPending(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Ownership couldn't be transferred.");
        return;
      }
      setSuccess("Ownership transferred. Your role is now Admin.");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!members.length) {
    return <p className="text-sm text-text-muted">Invite another active member before transferring ownership.</p>;
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">New owner</span>
        <select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
      {success && <p role="status" className="text-sm text-success-dark">{success}</p>}
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void transfer()}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        Transfer ownership
      </Button>
    </div>
  );
}
