import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditFailureCategory, AuditOutcome, AuditSeverity, Prisma } from "@prisma/client";
import { CompactFilters } from "@/components/data-display/compact-filters";
import { BackLink } from "@/components/layout/BackLink";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";
import { AUDIT_ACTIONS } from "@/lib/constants";

export const metadata: Metadata = { title: "Audit log" };

type AuditParams = {
  page?: string;
  pageSize?: string;
  entityType?: string;
  actorId?: string;
  entityId?: string;
  action?: string;
  outcome?: string;
  severity?: string;
  failureCategory?: string;
  from?: string;
  to?: string;
};

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<AuditParams> }) {
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
  const outcome = Object.values(AuditOutcome).find((value) => value === params.outcome);
  const severity = Object.values(AuditSeverity).find((value) => value === params.severity);
  const failureCategory = Object.values(AuditFailureCategory).find((value) => value === params.failureCategory);
  const where: Prisma.AuditLogWhereInput = {
    organizationId: context.organizationId,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(outcome ? { outcome } : {}),
    ...(severity ? { severity } : {}),
    ...(failureCategory ? { failureCategory } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
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
  for (const [key, value] of Object.entries({
    entityType,
    actorId,
    entityId,
    action,
    outcome,
    severity,
    failureCategory,
    from: params.from,
    to: params.to,
    pageSize: String(pageSize),
  })) {
    if (value) next.set(key, value);
  }
  const filters = [
    { key: "entityType", label: "Entity", value: entityType ?? "" },
    { key: "actorId", label: "Actor ID", value: actorId ?? "" },
    { key: "entityId", label: "Record ID", value: entityId ?? "" },
    { key: "action", label: "Action", value: action?.replaceAll("_", " ") ?? "" },
    { key: "outcome", label: "Outcome", value: outcome ?? "" },
    { key: "severity", label: "Severity", value: severity ?? "" },
    { key: "failureCategory", label: "Failure type", value: failureCategory?.replaceAll("_", " ") ?? "" },
    { key: "from", label: "From", value: params.from ?? "" },
    { key: "to", label: "To", value: params.to ?? "" },
  ];

  return (
    <div className="space-y-5">
      <BackLink href="/settings" label="Settings" currentPage="Audit log" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Administration</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Audit log</h1>
        <p className="mt-2 text-sm text-text-secondary">A readable history of organization activity, outcomes, and system warnings.</p>
      </header>
      <CompactFilters
        pathname="/audit-log"
        params={params}
        fieldNames={["entityType", "actorId", "entityId", "action", "outcome", "severity", "failureCategory", "from", "to"]}
        filters={filters}
        preserveOnClear={["pageSize"]}
        submitLabel="Apply filters"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Entity</span><input name="entityType" defaultValue={entityType} placeholder="project, member…" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Actor ID</span><input name="actorId" defaultValue={actorId} placeholder="Member ID" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Record ID</span><input name="entityId" defaultValue={entityId} placeholder="Record ID" className="min-h-11 w-full rounded-md border border-border-default px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Action</span><select name="action" defaultValue={action ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All actions</option>{AUDIT_ACTIONS.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Outcome</span><select name="outcome" defaultValue={outcome ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All outcomes</option>{Object.values(AuditOutcome).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Severity</span><select name="severity" defaultValue={severity ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All severities</option>{Object.values(AuditSeverity).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">Failure type</span><select name="failureCategory" defaultValue={failureCategory ?? ""} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"><option value="">All failures</option>{Object.values(AuditFailureCategory).map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">From</span><input type="date" name="from" defaultValue={params.from} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-text-secondary">To</span><input type="date" name="to" defaultValue={params.to} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" /></label>
        </div>
      </CompactFilters>

      <section aria-label="Audit entries" className="overflow-x-auto rounded-lg border border-border-default bg-surface">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <tr><th className="px-3 py-3">When</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">On</th><th className="px-3 py-3">Outcome</th><th className="px-3 py-3">Severity</th><th className="px-3 py-3 text-right">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {entries.map((entry) => (
              <tr key={entry.id} className="align-top hover:bg-neutral-50">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-text-muted"><time dateTime={entry.createdAt.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(entry.createdAt)}</time></td>
                <td className="max-w-48 truncate px-3 py-3 text-xs text-text-secondary">{entry.actor?.name ?? entry.actorEmail ?? entry.actor?.email ?? entry.actorId ?? "System action"}</td>
                <td className="px-3 py-3 text-xs font-medium text-text-primary">{entry.action.replaceAll("_", " ")}</td>
                <td className="px-3 py-3 text-xs text-text-secondary">{entry.entityType.replaceAll("_", " ")}{entry.entityId && <code className="ml-1 font-mono text-[11px] text-text-muted">{entry.entityId}</code>}</td>
                <td className="px-3 py-3"><StatusBadge status={entry.outcome} /></td>
                <td className="px-3 py-3"><StatusBadge status={entry.severity} /></td>
                <td className="relative px-3 py-2 text-right">
                  <details className="inline-block text-left">
                    <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-md px-2 text-xs font-semibold text-brand-primary hover:bg-neutral-100 [&::-webkit-details-marker]:hidden">View</summary>
                    <div className="absolute right-2 z-20 mt-1 w-[min(90vw,38rem)] rounded-md border border-border-default bg-surface p-4 text-left shadow-lg">
                      <p className="text-sm font-medium text-text-primary">{entry.summary ?? `${entry.action.replaceAll("_", " ")} ${entry.entityType.replaceAll("_", " ")}`}</p>
                      {entry.failureCategory && <p className="mt-1 text-xs text-text-secondary">Failure type: {entry.failureCategory.replaceAll("_", " ")}</p>}
                      {entry.errorCode && <p className="mt-1 font-mono text-xs text-text-muted">Code: {entry.errorCode}</p>}
                      {entry.correlationId && <p className="mt-1 font-mono text-xs text-text-muted">Reference: {entry.correlationId}</p>}
                      {(entry.before || entry.after) && <div className="mt-3 grid gap-3 border-t border-border-default pt-3 sm:grid-cols-2"><HumanSnapshot title="Before" value={entry.before} /><HumanSnapshot title="After" value={entry.after} /></div>}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {!entries.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">No audit entries match these filters.</td></tr>}
          </tbody>
        </table>
      </section>
      <nav aria-label="Audit log pages" className="flex items-center justify-between gap-3 text-sm">
        <p className="text-text-muted">Page {Math.min(page, pages)} of {pages} · {total} entries</p>
        <div className="flex gap-2"><PageLink params={next} page={page - 1} disabled={page <= 1} label="Previous" /><PageLink params={next} page={page + 1} disabled={page >= pages} label="Next" /></div>
      </nav>
    </div>
  );
}

function HumanSnapshot({ title, value }: { title: string; value: Prisma.JsonValue | null | undefined }) {
  if (value === null || value === undefined) return null;
  const entries = typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [["Details", value] as const];
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold text-text-secondary">{title}</h3>
      <dl className="mt-1 space-y-1">
        {entries.map(([key, item]) => <div key={key} className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(0,1.2fr)] gap-2 text-xs"><dt className="text-text-muted">{humanize(key)}</dt><dd className="break-words text-text-secondary">{auditValue(item)}</dd></div>)}
      </dl>
    </div>
  );
}

function auditValue(value: Prisma.JsonValue | undefined): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(auditValue).join(", ");
  return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${auditValue(item)}`).join("; ");
}

function humanize(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function PageLink({ params, page, disabled, label }: { params: URLSearchParams; page: number; disabled: boolean; label: string }) {
  const query = new URLSearchParams(params);
  query.set("page", String(Math.max(1, page)));
  return disabled
    ? <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 text-text-muted">{label}</span>
    : <Link href={`/audit-log?${query.toString()}`} className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 text-text-secondary hover:bg-neutral-50">{label}</Link>;
}

function parseOptionalDate(value?: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}
