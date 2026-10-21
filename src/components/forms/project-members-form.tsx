"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectMembersForm({
  projectId,
  members,
  initial,
}: {
  projectId: string;
  members: Array<{ id: string; name: string; title: string | null }>;
  initial: Array<{ id: string; role: "LEAD" | "MEMBER" }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, "LEAD" | "MEMBER">>(
    Object.fromEntries(initial.map(({ id, role }) => [id, role])),
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  function toggle(memberId: string, checked: boolean) {
    setSelected((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[memberId];
        return next;
      }
      return { ...current, [memberId]: "MEMBER" };
    });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!Object.values(selected).includes("LEAD")) {
      setError("Assign at least one project lead.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: Object.entries(selected).map(([memberId, role]) => ({ memberId, role })) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Project access couldn't be updated.");
        return;
      }
      setSuccess("Project access saved.");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-4">
      <p className="text-sm text-text-secondary">People assigned to this project can see its details. Project leads can manage project access.</p>
      <ul className="divide-y divide-border-default rounded-md border border-border-default">
        {members.map((member) => {
          const role = selected[member.id];
          return <li key={member.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
            <label className="flex min-h-11 flex-1 items-center gap-3 text-sm">
              <input type="checkbox" checked={role !== undefined} onChange={(event) => toggle(member.id, event.target.checked)} className="size-4 accent-brand-primary" />
              <span className="min-w-0"><span className="block truncate font-medium text-text-primary">{member.name}</span>{member.title && <span className="text-xs text-text-muted">{member.title}</span>}</span>
            </label>
            {role !== undefined && <select aria-label={`${member.name} project role`} value={role} onChange={(event) => setSelected((current) => ({ ...current, [member.id]: event.target.value as "LEAD" | "MEMBER" }))} className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-sm"><option value="MEMBER">Member</option><option value="LEAD">Lead</option></select>}
          </li>;
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
      {success && <p role="status" className="text-sm text-success-dark">{success}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save project access"}</button>
    </form>
  );
}
