import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Package, Plus, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { AssetCsvImportForm } from "@/components/forms/asset-csv-import-form";
import { assetFilterWhere } from "@/lib/asset-filters";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";
import { roleAtLeast } from "@/lib/rbac";

export const metadata: Metadata = { title: "Assets" };

const availabilityOptions = [
  ["AVAILABLE", "Available"],
  ["IN_USE", "In use"],
  ["MAINTENANCE", "Maintenance"],
  ["RETIRED", "Retired"],
  ["INACTIVE", "Inactive"],
] as const;

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    category?: string;
    status?: string;
    memberId?: string;
    projectId?: string;
    location?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const params = await searchParams;
  const search = params.search?.trim().slice(0, 120) ?? "";
  const category = params.category?.trim().slice(0, 100) ?? "";
  const status = availabilityOptions.find(([value]) => value === params.status)?.[0];
  const memberId = params.memberId ?? "";
  const projectId = params.projectId ?? "";
  const location = params.location?.trim().slice(0, 160) ?? "";
  const pageValue = Number(params.page ?? 1);
  const page = Number.isSafeInteger(pageValue) ? Math.max(1, pageValue) : 1;
  const sort = ["title", "category", "assetCode", "updatedAt"].includes(params.sort ?? "") ? params.sort! : "updatedAt";
  const filtersActive = Boolean(search || category || status || memberId || projectId || location);
  const assetWhere = assetFilterWhere(context.organizationId, { search, category, status, memberId, projectId, location });

  const [assets, totalAssetCount, filteredCount, categories, locations, members, projects] = await Promise.all([
    db.asset.findMany({
      where: assetWhere,
      include: {
        checkouts: {
          where: { organizationId: context.organizationId, returnedAt: null },
          take: 1,
          orderBy: { checkedOutAt: "desc" },
          include: {
            member: { include: { user: { select: { name: true, email: true } } } },
            project: { select: { id: true, code: true, title: true } },
            deployment: { select: { id: true, title: true, location: true } },
          },
        },
      },
      orderBy: sort === "updatedAt" ? { updatedAt: "desc" } : { [sort]: "asc" },
      skip: (page - 1) * 50,
      take: 50,
    }),
    db.asset.count({ where: { organizationId: context.organizationId } }),
    db.asset.count({ where: assetWhere }),
    db.asset.findMany({
      where: { organizationId: context.organizationId, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
    db.asset.findMany({
      where: { organizationId: context.organizationId, location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    }),
    db.organizationMember.findMany({
      where: {
        organizationId: context.organizationId,
        OR: [
          { isActive: true },
          { assetCheckouts: { some: { organizationId: context.organizationId, returnedAt: null } } },
        ],
      },
      select: { id: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.project.findMany({
      where: { organizationId: context.organizationId },
      select: { id: true, code: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization resources</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Assets</h1>
          <p className="mt-2 text-sm text-text-secondary">Track equipment, documents, and other resources your team uses.</p>
        </div>
        {roleAtLeast(context.role, "MANAGER") && (
          <Link href="/assets/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-600">
            <Plus size={16} aria-hidden="true" /> Register asset
          </Link>
        )}
      </header>

      {roleAtLeast(context.role, "ADMIN") && <AssetCsvImportForm />}

      <form className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="page" value="1" />
        <label className="relative">
          <span className="sr-only">Search assets</span>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input name="search" defaultValue={search} placeholder="Search name, code, serial, or location" className="min-h-11 w-full rounded-md border border-border-default bg-surface pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15" />
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select name="category" defaultValue={category} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All categories</option>
            {categories.flatMap(({ category: value }) => value ? [<option key={value} value={value}>{value}</option>] : [])}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by availability</span>
          <select name="status" defaultValue={status} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All availability</option>
            {availabilityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by assigned member</span>
          <select name="memberId" defaultValue={memberId} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All assigned members</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.user.name ?? member.user.email}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by linked project</span>
          <select name="projectId" defaultValue={projectId} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All linked projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by location</span>
          <select name="location" defaultValue={location} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="">All locations</option>
            {locations.flatMap(({ location: value }) => value ? [<option key={value} value={value}>{value}</option>] : [])}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort assets</span>
          <select name="sort" defaultValue={sort} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm">
            <option value="updatedAt">Recently updated</option><option value="title">Name</option><option value="category">Category</option><option value="assetCode">Asset code</option>
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 xl:col-span-3">
          <button type="submit" className="min-h-11 rounded-md border border-border-default px-4 text-sm font-semibold text-text-primary hover:bg-neutral-50">Apply filters</button>
          {filtersActive && <Link href="/assets" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-brand-primary hover:underline">Clear filters</Link>}
        </div>
      </form>

      {assets.length ? (
        <>
          {totalAssetCount < 5 && (
            <aside className="rounded-lg border border-border-default bg-surface px-4 py-3 text-sm text-text-secondary">
              Keep the registry useful by recording a clear category, storage location, and service date for each resource.
            </aside>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => {
              const checkout = asset.checkouts[0];
              return (
                <li key={asset.id}>
                  <Link href={`/assets/${asset.id}`} className="block min-h-36 rounded-lg border border-border-default bg-surface p-4 transition-colors duration-150 hover:bg-neutral-50 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-info-light text-brand-primary"><Package size={19} aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-text-muted">{asset.assetCode}</p>
                          <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">{asset.title}</h2>
                        </div>
                      </div>
                      <StatusBadge status={checkout ? "IN_USE" : asset.status === "ACTIVE" ? "AVAILABLE" : asset.status} />
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-text-muted">
                      <span className="truncate">
                        {asset.category ?? "Uncategorized"} · {asset.location ?? "Location not set"}
                        {checkout ? ` · ${checkout.member.user.name ?? checkout.member.user.email}` : ""}
                        {checkout?.deployment ? ` · ${checkout.deployment.title ?? checkout.deployment.location}` : ""}
                      </span>
                      <ArrowRight size={15} className="shrink-0 text-brand-primary" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-10">
          <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-info-light text-brand-primary"><Package size={21} aria-hidden="true" /></div>
          <div className="mx-auto mt-3 max-w-xl text-center">
            <h2 className="text-sm font-semibold text-text-primary">{filtersActive ? "No matching assets" : "No assets registered"}</h2>
            <p className="mt-2 text-sm text-text-muted">
              {filtersActive
                ? "Try another filter or clear the current filters."
                : "Assets can be equipment, tools, documents, or other resources. Record their location and service dates, then check them out to a member and project when they are in use."}
            </p>
            {!filtersActive && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Example categories</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {["Equipment", "Tools", "Documents", "Software"].map((value) => (
                    <Link key={value} href={`/assets/new?category=${encodeURIComponent(value)}`} className="rounded-full border border-border-default px-3 py-1.5 text-xs font-medium text-brand-primary transition-colors duration-150 hover:bg-neutral-50">{value}</Link>
                  ))}
                </div>
              </div>
            )}
            {!filtersActive && roleAtLeast(context.role, "MANAGER") && (
              <Link href="/assets/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white">
                <Plus size={15} aria-hidden="true" /> Add your first asset
              </Link>
            )}
          </div>
        </div>
      )}
      {filteredCount > 50 && <nav aria-label="Asset pages" className="flex items-center justify-between gap-3 text-sm">
        <p className="text-text-muted">Page {Math.min(page, Math.ceil(filteredCount / 50))} of {Math.ceil(filteredCount / 50)} · {filteredCount} assets</p>
        <div className="flex gap-2">
          <PageLink params={params} page={page - 1} disabled={page <= 1} label="Previous" />
          <PageLink params={params} page={page + 1} disabled={page >= Math.ceil(filteredCount / 50)} label="Next" />
        </div>
      </nav>}
    </div>
  );
}

function PageLink({ params, page, disabled, label }: { params: { search?: string; category?: string; status?: string; memberId?: string; projectId?: string; location?: string; sort?: string }; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 text-text-muted">{label}</span>;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  query.set("page", String(page));
  return <Link href={`/assets?${query.toString()}`} className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 font-medium text-text-secondary hover:bg-neutral-50">{label}</Link>;
}
