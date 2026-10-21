"use client";

import { Archive, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ProjectArchiveButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function archive() {
    if (!window.confirm("Archive this project? It will remain in the audit history.")) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Project couldn't be archived.");
        return;
      }
      router.replace("/projects");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="danger" disabled={pending} onClick={() => void archive()}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
        Archive project
      </Button>
      {error && <p role="alert" className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
