import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/BackLink";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    entityType?: string;
    actorId?: string;
    entityId?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  if (!roleAtLeast(context.role, "ADMIN")) notFound();
  const params = await searchParams;
  const pageValue = Number(params.page ?? 1);
  const pageSizeValue = Number(params.pageSize ?? 20);
  const page = Number.isSafeInteger(pageValue) ? Math.max(1, pageValue) : 1;
  const pageSize = Number.isSafeInteger(pageSizeValue) ? Math.min(100, Math.max(1, pageSizeValue)) : 20;
  const from = parseOptionalDate(params.from);
  const to = parseOptionalDate(params.to);
  if ((params.from && !from) || (params.to && !to)) {
    return (
      <div className="rounded-lg border border-error-light bg-error-light p-5">
        <h1 className="font-heading text-lg font-semibold text-error-dark">Invalid date filter</h1>
        <p className="mt-2 text-sm text-error-dark">Choose valid start and end dates, then apply the filters again.</p>
        <a href="/audit-log" className="mt-3 inline-flex min-h-11 items-center font-semibold text-error-dark underline">Clear filters</a>
      </div>
    );
  }
  if (params.to && to) to.setUTCHours(23, 59, 59, 999);
  const entityType = params.entityType?.trim().slice(0, 64);
  const actorId = params.actorId?.trim();
  const entityId = params.entityId?.trim();
  const action = AUDIT_ACTIONS.find((value) => value === params.action);
  const where: Prisma.AuditLogWhereInput = {
    organizationId: context.organizationId,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(from || to ? {
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    } : {}),
  };

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const next = new URLSearchParams();
  if (entityType) next.set("entityType", entityType);
  if (entityId) next.set("entityId", entityId);
  if (actorId) next.set("actorId", actorId);
  if (action) next.set("action", action);
  if (params.from) next.set("from", params.from);
  if (params.to) next.set("to", params.to);

  return (
    <div className="space-y-6">
      <BackLink href="/settings" label="Settings" currentPage="Audit log" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Administration</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Audit log</h1>
        <p className="mt-2 text-sm text-text-secondary">Read-only history of organization activity.</p>
      </header>

      <form className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Entity</span>
          <input name="entityType" defaultValue={entityType} placeholder="project, member…" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Actor ID</span>
          <input name="actorId" defaultValue={actorId} placeholder="Member user ID" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Entity ID</span>
          <input name="entityId" defaultValue={entityId} placeholder="Record ID" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Action</span>
          <select name="action" defaultValue={action ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">From</span>
          <input type="date" name="from" defaultValue={params.from} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">To</span>
          <input type="date" name="to" defaultValue={params.to} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" />
        </label>
        <div className="flex gap-2 xl:col-span-full">
          <button className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-600">Filter log</button>
          <a href="/audit-log" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-text-secondary hover:bg-neutral-100">Clear</a>
        </div>
      </form>

      <section aria-label="Audit entries" className="space-y-3">
        {entries.length ? entries.map((entry) => (
          <article key={entry.id} className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{entry.action.replaceAll("_", " ")}</span>
                  <span className="text-xs font-medium text-text-secondary">{entry.entityType.replaceAll("_", " ")}</span>
                  {entry.entityId && <code className="font-mono text-xs text-text-muted">{entry.entityId}</code>}
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {entry.actor?.name ?? entry.actorEmail ?? entry.actor?.email ?? entry.actorId ?? "System action"}
                </p>
              </div>
              <time dateTime={entry.createdAt.toISOString()} className="text-xs text-text-muted">
                {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(entry.createdAt)}
              </time>
            </div>
            {(entry.before || entry.after) && (
              <details className="mt-3 border-t border-border-default pt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-brand-primary">View change details</summary>
                <div className="grid gap-3 sm:grid-cols-2">
                  {entry.before && <JsonSnapshot title="Before" value={entry.before} />}
                  {entry.after && <JsonSnapshot title="After" value={entry.after} />}
                </div>
              </details>
            )}
          </article>
        )) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-10 text-center text-sm text-text-muted">
            No audit entries match these filters.
          </p>
        )}
      </section>
      <nav aria-label="Audit log pages" className="flex items-center justify-between gap-3 text-sm">
        <p className="text-text-muted">Page {Math.min(page, pages)} of {pages} · {total} entries</p>
        <div className="flex gap-2">
          <PageLink params={next} page={page - 1} disabled={page <= 1} label="Previous" />
          <PageLink params={next} page={page + 1} disabled={page >= pages} label="Next" />
        </div>
      </nav>
    </div>
  );
}

function JsonSnapshot({ title, value }: { title: string; value: Prisma.JsonValue }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold text-text-secondary">{title}</h3>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-neutral-50 p-3 text-xs text-text-secondary">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function PageLink({ params, page, disabled, label }: { params: URLSearchParams; page: number; disabled: boolean; label: string }) {
  const query = new URLSearchParams(params);
  query.set("page", String(Math.max(1, page)));
  return disabled
    ? <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 text-text-muted">{label}</span>
    : <a href={`/audit-log?${query.toString()}`} className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 text-text-secondary hover:bg-neutral-50">{label}</a>;
}

function parseOptionalDate(value?: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}
