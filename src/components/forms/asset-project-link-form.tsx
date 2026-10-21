"use client";

import { Link2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AssetProjectLinkForm({
  assetId,
  projects,
}: {
  assetId: string;
  projects: Array<{ id: string; code: string; title: string }>;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function linkProject() {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/assets/${assetId}/link-project`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Project couldn't be linked to the asset.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!projects.length) return <p className="text-sm text-text-muted">Create a project before linking this asset.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Project to link</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
          </select>
        </label>
        <Button type="button" disabled={pending} onClick={() => void linkProject()}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          Link project
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
    </div>
  );
}
