import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Plus, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CompactFilters } from "@/components/data-display/compact-filters";
import { db } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";
import { PROJECT_STATUSES } from "@/lib/constants";
import { roleAtLeast } from "@/lib/rbac";
import { CsvImportPanel } from "@/components/forms/csv-import-panel";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { metadataCsvHeaders } from "@/lib/metadata-csv";
import { serializeCsvRow } from "@/lib/csv";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const context = await resolveTenantContext();
  if (!context) return null;
  const params = await searchParams;
  const search = params.search?.trim().slice(0, 120) ?? "";
  const status = PROJECT_STATUSES.find((value) => value === params.status);

  const projects = await db.project.findMany({
    where: {
      organizationId: context.organizationId,
      ...(roleAtLeast(context.role, "ADMIN") ? {} : { members: { some: { memberId: context.memberId } } }),
      status: { not: "ARCHIVED" },
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { milestones: true, tasks: true, allocations: true } } },
  });
  const customHeaders = [...metadataCsvHeaders(await getDefaultMetadataFields(context.organizationId, "project")).keys()];
  const importTemplate = [
    serializeCsvRow(["code", "title", "status", "description", "startDate", "endDate", "budgetHours", "workflow", ...customHeaders]),
    serializeCsvRow(["PRJ-101", "Workspace rollout", "PLANNING", "Coordinate the rollout.", "2026-11-02", "2027-02-26", "240", "", ...customHeaders.map(() => "")]),
  ].join("\n");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Work management</p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Projects</h1>
          <p className="mt-2 text-sm text-text-secondary">Plan work, track milestones, and keep your team aligned.</p>
        </div>
        {roleAtLeast(context.role, "MANAGER") && (
          <div className="flex items-center gap-2">
            <CsvImportPanel
              title="Import projects from CSV"
              endpoint="/api/projects/import"
              template={importTemplate}
              help="Required columns: code and title. Existing project codes update matching projects. Blank optional cells keep current values."
            />
            <Link href="/projects/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary-600">
              <Plus size={16} aria-hidden="true" /> Create project
            </Link>
          </div>
        )}
      </header>

      <CompactFilters
        pathname="/projects"
        params={params}
        fieldNames={["search", "status"]}
        filters={[
          { key: "search", label: "Search", value: search },
          { key: "status", label: "Status", value: status?.replaceAll("_", " ") ?? "" },
        ]}
      >
        <div className="grid gap-3 sm:grid-cols-2">
        <label className="relative">
          <span className="sr-only">Search projects</span>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by project name or code"
            className="min-h-11 w-full rounded-md border border-border-default bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-neutral-400 focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15"
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15"
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.filter((value) => value !== "ARCHIVED").map((value) => (
              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        </div>
      </CompactFilters>

      {projects.length ? (
        <>
          <div className="grid gap-3 md:hidden">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="rounded-lg border border-border-default bg-surface p-4 shadow-xs transition-colors duration-150 hover:bg-neutral-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-text-muted">{project.code}</p>
                    <h2 className="mt-1 truncate text-base font-semibold text-text-primary">{project.title}</h2>
                  </div>
                  <StatusBadge status={project.status} />
                </div>
                <p className="mt-4 text-xs text-text-secondary">
                  {project._count.milestones} milestones · {project._count.tasks} tasks
                </p>
                <span className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-primary">
                  View project <ArrowRight size={15} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-lg border border-border-default bg-surface shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Project</th>
                  <th scope="col" className="px-5 py-3.5">Status</th>
                  <th scope="col" className="px-5 py-3.5">Milestones</th>
                  <th scope="col" className="px-5 py-3.5">Tasks</th>
                  <th scope="col" className="px-5 py-3.5"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {projects.map((project) => (
                  <tr key={project.id} className="transition-colors duration-150 hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <Link href={`/projects/${project.id}`} className="block min-h-11 rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-border-focus">
                        <span className="block font-semibold text-text-primary">{project.title}</span>
                        <span className="mt-1 block font-mono text-xs text-text-muted">{project.code}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={project.status} /></td>
                    <td className="px-5 py-4 tabular-nums text-text-secondary">{project._count.milestones}</td>
                    <td className="px-5 py-4 tabular-nums text-text-secondary">{project._count.tasks}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.title}`} className="inline-flex size-11 items-center justify-center rounded-md text-brand-primary hover:bg-info-light">
                        <ArrowRight size={17} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-5 py-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-info-light text-brand-primary">
            <BriefcaseBusiness size={22} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-text-primary">{search || status ? "No matching projects" : "No projects yet"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
            {search || status ? "Try another search or clear your filters." : "Create a project to bring your team's work, milestones, and tasks together."}
          </p>
          {search || status ? (
            <Link href="/projects" className="mt-4 inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-brand-primary hover:bg-neutral-50">
              Clear filters
            </Link>
          ) : (
            <Link href="/projects/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-600">
              <Plus size={16} aria-hidden="true" /> Create project
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
