import Link from "next/link";
import { X } from "lucide-react";
import { clearFiltersHref, removeFilterParamsHref, type FilterQuery } from "@/lib/filter-params";

export type AppliedFilter = {
  key: string | string[];
  label: string;
  value: string;
};

export function CompactFilters({
  pathname,
  params,
  fieldNames,
  filters,
  preserveOnClear = [],
  submitLabel = "Apply filters",
  children,
}: {
  pathname: string;
  params: FilterQuery;
  fieldNames: string[];
  filters: AppliedFilter[];
  preserveOnClear?: string[];
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const activeFilters = filters.filter(({ value }) => value !== "");
  const filterFields = new Set(fieldNames);
  const preserved = Object.entries(params).filter(([key, value]) =>
    key !== "page" && !filterFields.has(key) && value,
  );

  return (
    <section aria-label="Filters" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <details className="group relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-border-default bg-surface px-3 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus [&::-webkit-details-marker]:hidden">
            Filter by
            {activeFilters.length > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-info-light text-xs text-brand-primary">
                {activeFilters.length}
              </span>
            )}
          </summary>
          <div className="absolute left-0 top-full z-30 mt-2 w-[min(90vw,40rem)] rounded-lg border border-border-default bg-surface p-4 shadow-lg">
            <form action={pathname} method="get" className="space-y-4">
              {preserved.map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
              {children}
              <div className="flex flex-wrap gap-2 border-t border-border-default pt-3">
                <button type="submit" className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary-600">
                  {submitLabel}
                </button>
                {activeFilters.length > 0 && (
                  <Link href={clearFiltersHref(pathname, params, preserveOnClear)} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-text-secondary transition-colors duration-150 hover:bg-neutral-100">
                    Clear all
                  </Link>
                )}
              </div>
            </form>
          </div>
        </details>
        {activeFilters.map(({ key, label, value }) => (
          <Link
            key={Array.isArray(key) ? key.join(":") : key}
            href={removeFilterParamsHref(pathname, params, Array.isArray(key) ? key : [key])}
            aria-label={`Remove ${label} filter`}
            className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border-default bg-surface px-3 text-xs text-text-secondary transition-colors duration-150 hover:bg-neutral-50"
          >
            <span className="truncate"><span className="font-medium text-text-primary">{label}:</span> {value}</span>
            <X size={13} aria-hidden="true" className="shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}
