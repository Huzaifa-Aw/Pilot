"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TimesheetPeriodStatus } from "@prisma/client";

type ProjectOption = { id: string; code: string; title: string };
type TaskOption = { id: string; projectId: string; title: string; taskNumber: number | null };
type WorklogOption = {
  id: string;
  date: Date;
  hours: number;
  description: string | null;
  category: string | null;
  project: { id: string; code: string; title: string } | null;
  task: { id: string; title: string; taskNumber: number | null } | null;
};

export function WorklogCreateForm({
  month,
  projects,
  tasks,
  membersForAdmin = [],
}: {
  month: string;
  projects: ProjectOption[];
  tasks: TaskOption[];
  membersForAdmin?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const category = String(data.get("category") ?? "");
    const taskId = String(data.get("taskId") ?? "");
    try {
      const response = await fetch("/api/worklogs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || null,
          taskId: taskId || null,
          ...(membersForAdmin.length ? { memberId: String(data.get("memberId")) } : {}),
          date: String(data.get("date")),
          hours: Number(data.get("hours")),
          description: String(data.get("description") ?? ""),
          category: category || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Time couldn't be logged.");
        return;
      }
      form.reset();
      setProjectId("");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-2 xl:grid-cols-3" noValidate>
      <h2 className="text-sm font-semibold text-text-primary sm:col-span-2 xl:col-span-3">Log time</h2>
      {membersForAdmin.length > 0 && <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Person</span><select name="memberId" required className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">{membersForAdmin.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
      <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Date</span><input type="date" name="date" required min={`${month}-01`} max={new Date().toISOString().slice(0, 10)} defaultValue={month === new Date().toISOString().slice(0, 7) ? new Date().toISOString().slice(0, 10) : `${month}-01`} className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Hours</span><input type="number" name="hours" required min="0.25" max="24" step="0.25" inputMode="decimal" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">Non-project time</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}</select></label>
      {projectId && <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Task (optional)</span><select name="taskId" defaultValue="" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">Project only</option>{tasks.filter((task) => task.projectId === projectId).map((task) => <option key={task.id} value={task.id}>{task.taskNumber ? `#${task.taskNumber} ` : ""}{task.title}</option>)}</select></label>}
      {!projectId && <label className="space-y-1"><span className="text-xs font-medium text-text-secondary">Category</span><select name="category" defaultValue="" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">Choose category</option>{["Training", "Leave", "Internal", "Travel", "Other"].map((category) => <option key={category}>{category}</option>)}</select></label>}
      <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-text-secondary">Description</span><input name="description" maxLength={2000} placeholder="What did you work on?" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
      {error && <p role="alert" className="text-sm text-error-dark sm:col-span-2 xl:col-span-3">{error}</p>}
      <div className="sm:col-span-2 xl:col-span-3"><button type="submit" disabled={pending} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Logging..." : "Log time"}</button></div>
    </form>
  );
}

export function WorklogList({ entries, locked, month }: { entries: WorklogOption[]; locked: boolean; month: string }) {
  const byDate = new Map<string, WorklogOption[]>();
  for (const entry of entries) {
    const date = entry.date.toISOString().slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), entry]);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const calendar = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > days) return null;
    const date = new Date(Date.UTC(year, monthNumber - 1, day)).toISOString().slice(0, 10);
    const items = byDate.get(date) ?? [];
    return { day, date, items, hours: items.reduce((sum, item) => sum + item.hours, 0), weekend: [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay()) };
  });
  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-lg border border-border-default bg-surface md:block">
        <div className="grid min-w-[56rem] grid-cols-7 border-b border-border-default bg-neutral-50">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="px-3 py-2 text-xs font-semibold text-text-muted">{day}</div>)}</div>
        <div className="grid min-w-[56rem] grid-cols-7">
          {calendar.map((cell, index) => cell ? (
            <div key={cell.date} className={`min-h-24 border-b border-r border-border-default p-2 ${cell.weekend ? "bg-neutral-50" : "bg-surface"}`}>
              <div className="flex items-center justify-between gap-1"><span className="text-xs font-semibold text-text-secondary">{cell.day}</span><span className="text-[11px] tabular-nums text-text-muted">{cell.hours ? `${cell.hours}h` : ""}</span></div>
              <ul className="mt-2 space-y-1">{cell.items.slice(0, 3).map((item) => <li key={item.id} title={`${item.hours}h · ${item.description ?? item.category ?? ""}`} className="truncate rounded bg-info-light px-1.5 py-1 text-[10px] text-info-dark">{item.task?.title ?? item.project?.code ?? item.category} · {item.hours}h</li>)}</ul>
              {cell.items.length > 3 && <p className="mt-1 text-[10px] text-text-muted">+{cell.items.length - 3} entries</p>}
            </div>
          ) : <div key={`empty-${index}`} className="min-h-24 border-b border-r border-border-default bg-neutral-50/50" />)}
        </div>
      </div>
      {entries.length ? [...byDate.entries()].map(([date, dayEntries]) => (
        <section key={date} className="overflow-hidden rounded-lg border border-border-default bg-surface md:hidden">
          <header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`))}</h3>
            <span className="text-xs tabular-nums text-text-muted">{dayEntries.reduce((total, entry) => total + entry.hours, 0)}h</span>
          </header>
          <ul className="divide-y divide-border-default">
            {dayEntries.map((entry) => <WorklogRow key={entry.id} entry={entry} locked={locked} />)}
          </ul>
        </section>
      )) : <p className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-8 text-sm text-text-muted md:hidden">No time logged this month yet. Add your first entry above.</p>}
    </div>
  );
}

function WorklogRow({ entry, locked }: { entry: WorklogOption; locked: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/worklogs/${entry.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hours: Number(data.get("hours")), description: String(data.get("description") ?? "") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Entry couldn't be updated.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/worklogs/${entry.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Entry couldn't be deleted.");
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
    <li className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{entry.task?.title ?? entry.project?.title ?? entry.category ?? "Work"}</p>
          <p className="mt-1 text-xs text-text-muted">{entry.project ? `${entry.project.code} · ` : ""}{entry.description || entry.category || "No note"}</p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-text-primary">{entry.hours}h</span>
      </div>
      {!locked && (
        <details className="mt-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-brand-primary">Edit entry</summary>
          <form onSubmit={(event) => void update(event)} className="mt-2 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto_auto]" noValidate>
            <input type="number" name="hours" min="0.25" max="24" step="0.25" defaultValue={entry.hours} aria-label="Hours" className="min-h-11 rounded-md border border-border-default px-3 text-sm" />
            <input name="description" maxLength={2000} defaultValue={entry.description ?? ""} aria-label="Description" className="min-h-11 rounded-md border border-border-default px-3 text-sm" />
            <button type="submit" disabled={pending} className="min-h-11 rounded-md border border-border-default px-3 text-sm font-semibold">Save</button>
            <button type="button" disabled={pending} onClick={() => void remove()} className="min-h-11 rounded-md border border-error-light px-3 text-sm font-semibold text-error-dark">Delete</button>
          </form>
          {error && <p role="alert" className="mt-2 text-xs text-error-dark">{error}</p>}
        </details>
      )}
    </li>
  );
}

export function TimesheetPeriodAction({
  periodId,
  status,
  action,
  review,
}: {
  periodId: string;
  status: TimesheetPeriodStatus;
  action: "SUBMITTED" | "APPROVED" | "REOPENED";
  review?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const label = action === "SUBMITTED" ? "Submit month" : action === "APPROVED" ? "Approve month" : "Reopen month";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/timesheet-periods/${periodId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: action, ...(review ? { reviewNotes: String(data.get("reviewNotes") ?? "") } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Timesheet couldn't be updated.");
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
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      {review && <input name="reviewNotes" maxLength={2000} placeholder="Review note (optional)" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />}
      <button type="submit" disabled={pending || (action === "SUBMITTED" && status !== "OPEN" && status !== "REOPENED")} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Updating..." : label}</button>
      {error && <p role="alert" className="text-xs text-error-dark">{error}</p>}
    </form>
  );
}

export function TimesheetReminderButton({ memberId, month }: { memberId: string; month: string }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  async function remind() {
    setPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/timesheet-reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, month }),
      });
      const result = await response.json();
      setStatus(response.ok ? "Reminder sent." : result.error ?? "Reminder couldn't be sent.");
    } catch {
      setStatus("We couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }
  return <div className="space-y-1"><button type="button" onClick={() => void remind()} disabled={pending} className="min-h-11 rounded-md border border-border-default px-3 text-xs font-semibold text-brand-primary disabled:opacity-50">{pending ? "Sending..." : "Remind"}</button>{status && <p role="status" className="text-[11px] text-text-muted">{status}</p>}</div>;
}

export function MarkReminderReadButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function markRead() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, { method: "PATCH" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Reminder couldn't be dismissed.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }
  return <div className="mt-2"><button type="button" onClick={() => void markRead()} disabled={pending} className="min-h-11 rounded-md border border-border-default px-3 text-xs font-semibold text-text-secondary">{pending ? "Saving..." : "Mark read"}</button>{error && <p role="alert" className="mt-1 text-xs text-error-dark">{error}</p>}</div>;
}

export function BulkApproveTimesheets({ periodIds, action = "APPROVED" }: { periodIds: string[]; action?: "APPROVED" | "REOPENED" }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!periodIds.length) return null;
  async function approveAll() {
    setError("");
    setPending(true);
    try {
      for (const periodId of periodIds) {
        const response = await fetch(`/api/timesheet-periods/${periodId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: action, reviewNotes: note }),
        });
        if (!response.ok) {
          const result = await response.json();
          setError(result.error ?? "One or more timesheets could not be updated.");
          router.refresh();
          return;
        }
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Refresh to see which submissions are still waiting.");
    } finally {
      setPending(false);
    }
  }
  const label = action === "APPROVED" ? `Approve all ${periodIds.length}` : `Return all ${periodIds.length}`;
  return <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-3 sm:flex-row"><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Shared review note (optional)" className="min-h-11 flex-1 rounded-md border border-border-default px-3 text-sm" /><button type="button" onClick={() => void approveAll()} disabled={pending} className={`min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${action === "APPROVED" ? "bg-brand-primary text-white" : "border border-warning-light text-warning-dark"}`}>{pending ? "Updating..." : label}</button>{error && <p role="alert" className="text-xs text-error-dark">{error}</p>}</div>;
}
