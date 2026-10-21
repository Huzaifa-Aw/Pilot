"use client";

import { signOut, useSession } from "next-auth/react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OrganizationDeleteButton({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!window.confirm(`Deactivate ${organizationName}? Members will lose access, while records and audit history are retained.`)) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Organization couldn't be deactivated.");
        return;
      }

      if (result.data.nextOrganizationId) {
        await update({ activeOrganizationId: result.data.nextOrganizationId });
        window.localStorage.setItem("workspace:active-organization", `${result.data.nextOrganizationId}:${Date.now()}`);
        router.replace("/overview");
      } else {
        await signOut({ redirectTo: "/login" });
      }
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="danger" disabled={pending} onClick={() => void remove()}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
        Deactivate organization
      </Button>
      {error && <p role="alert" className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
