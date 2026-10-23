"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Plus, Search, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

export type TaskBoardFilterOption = { value: string; label: string; values?: string[] };

export type TaskBoardFilterField =
  | { key: string; label: string; kind: "options"; options: TaskBoardFilterOption[]; multiple?: boolean }
  | { key: string; label: string; kind: "range"; fromKey: string; toKey: string; inputType: "date" | "number"; step?: number }
  | { key: string; label: string; kind: "value"; inputType: "date" | "number" | "text" }
  | { key: string; label: string; kind: "text" | "toggle" };

const PRIMARY_FIELDS = ["parent", "assignee", "status", "priority", "label"];

function queryKeys(field: TaskBoardFilterField) {
  return field.kind === "range" ? [field.fromKey, field.toKey] : [field.key];
}

function isActive(field: TaskBoardFilterField, params: URLSearchParams) {
  return queryKeys(field).some((key) => params.getAll(key).some(Boolean));
}

function optionValues(option: TaskBoardFilterOption) {
  return option.values ?? [option.value];
}

function optionIsSelected(field: Extract<TaskBoardFilterField, { kind: "options" }>, option: TaskBoardFilterOption, params: URLSearchParams) {
  const selectedValues = new Set(params.getAll(field.key));
  return optionValues(option).some((value) => selectedValues.has(value));
}

function fieldSummary(field: TaskBoardFilterField, params: URLSearchParams) {
  if (field.kind === "options") {
    const values = params.getAll(field.key);
    const selectedOptions = field.options.filter((option) => optionIsSelected(field, option, params));
    const recognizedValues = new Set(selectedOptions.flatMap(optionValues));
    const labels = selectedOptions.map(({ label }) => label);
    labels.push(...values.filter((value) => !recognizedValues.has(value)));
    return labels.join(", ");
  }
  if (field.kind === "range") {
    const from = params.get(field.fromKey);
    const to = params.get(field.toKey);
    if (from && to) return `${from} – ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Through ${to}`;
    return "";
  }
  if (field.kind === "toggle") return params.get(field.key) === "true" ? "On" : "";
  return params.get(field.key) ?? "";
}

function selectedCount(field: TaskBoardFilterField, params: URLSearchParams) {
  if (field.kind === "options") return field.options.filter((option) => optionIsSelected(field, option, params)).length;
  if (field.kind === "range") return Number(Boolean(params.get(field.fromKey))) + Number(Boolean(params.get(field.toKey)));
  return Number(isActive(field, params));
}

export function TaskBoardFilters({ fields }: { fields: TaskBoardFilterField[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const queryRef = useRef(new URLSearchParams(queryString));
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(() => {
    const initial = new Set(PRIMARY_FIELDS);
    const params = new URLSearchParams(queryString);
    fields.filter((field) => isActive(field, params)).forEach(({ key }) => initial.add(key));
    return [...initial].filter((key) => fields.some((field) => field.key === key));
  });
  const [selectedKey, setSelectedKey] = useState(PRIMARY_FIELDS.find((key) => fields.some((field) => field.key === key)) ?? fields[0]?.key ?? "");
  const [optionSearch, setOptionSearch] = useState("");
  const params = new URLSearchParams(queryString);
  const visibleFields = visibleKeys.flatMap((key) => {
    const field = fields.find((item) => item.key === key);
    return field ? [field] : [];
  });
  const selectedField = fields.find((field) => field.key === selectedKey) ?? visibleFields[0];
  const activeCount = fields.reduce((count, field) => count + selectedCount(field, params), 0);

  useEffect(() => {
    queryRef.current = new URLSearchParams(queryString);
  }, [queryString]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        setOpen(false);
        setAddingField(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAddingField(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function updateQuery(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(queryRef.current);
    update(next);
    next.delete("page");
    queryRef.current = next;
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setValues(field: TaskBoardFilterField, values: string[]) {
    updateQuery((next) => {
      next.delete(field.key);
      values.forEach((value) => next.append(field.key, value));
    });
  }

  function clearField(field: TaskBoardFilterField) {
    updateQuery((next) => queryKeys(field).forEach((key) => next.delete(key)));
  }

  function clearAll() {
    updateQuery((next) => fields.forEach((field) => queryKeys(field).forEach((key) => next.delete(key))));
  }

  function toggleOption(field: Extract<TaskBoardFilterField, { kind: "options" }>, option: TaskBoardFilterOption) {
    const current = queryRef.current.getAll(field.key);
    const values = optionValues(option);
    const selected = values.some((value) => current.includes(value));
    const nextValues = field.multiple
      ? selected ? current.filter((item) => !values.includes(item)) : [...new Set([...current, ...values])]
      : selected ? [] : values;
    setValues(field, nextValues);
  }

  const visibleOptions = selectedField?.kind === "options"
    ? selectedField.options.filter(({ label }) => label.toLowerCase().includes(optionSearch.trim().toLowerCase()))
    : [];

  return (
    <div ref={panelRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors duration-150 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${activeCount ? "border-brand-primary text-brand-primary" : "border-border-default bg-surface text-text-primary"}`}
        >
          <Filter size={16} aria-hidden="true" />
          Filter
          {activeCount > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-info-light text-xs text-brand-primary">{activeCount}</span>}
        </button>

        {open && (
          <section role="dialog" aria-label="Task filters" className="absolute left-auto right-0 top-full z-40 mt-2 flex h-[min(70vh,32rem)] min-h-80 w-[min(90vw,42rem)] overflow-hidden rounded-lg border border-border-default bg-surface shadow-lg">
            <aside className="flex w-44 shrink-0 flex-col border-r border-border-default bg-neutral-50 sm:w-56">
              <nav aria-label="Filter fields" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {visibleFields.map((field) => {
                  const count = selectedCount(field, params);
                  const selected = field.key === selectedField?.key;
                  return (
                    <button
                      type="button"
                      key={field.key}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => {
                        setSelectedKey(field.key);
                        setOptionSearch("");
                      }}
                      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-r-sm border-l-2 px-2 text-left text-sm transition-colors duration-150 ${selected ? "border-brand-primary bg-info-light text-info-dark" : "border-transparent text-text-secondary hover:bg-neutral-100"}`}
                    >
                      <span className="truncate">{field.label}</span>
                      {count > 0 && <span className="shrink-0 text-xs tabular-nums">{count}</span>}
                    </button>
                  );
                })}
                {addingField && (
                  <div className="mt-2 border-t border-border-default pt-2">
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Add a field</p>
                    {fields.filter(({ key }) => !visibleKeys.includes(key)).map((field) => (
                      <button
                        type="button"
                        key={field.key}
                        onClick={() => {
                          setVisibleKeys((current) => [...current, field.key]);
                          setSelectedKey(field.key);
                          setOptionSearch("");
                          setAddingField(false);
                        }}
                        className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm text-text-secondary transition-colors duration-150 hover:bg-neutral-100"
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                )}
              </nav>
              <button
                type="button"
                aria-expanded={addingField}
                onClick={() => setAddingField((value) => !value)}
                disabled={visibleKeys.length >= fields.length}
                className="m-2 inline-flex min-h-9 items-center gap-1 self-start rounded-md border border-border-default px-2 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-neutral-100 disabled:opacity-50"
              >
                <Plus size={14} aria-hidden="true" /> Add field
              </button>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {selectedField ? (
                <>
                  <header className="flex items-center justify-between gap-2 border-b border-border-default px-4 py-3">
                    <h2 className="truncate text-sm font-semibold text-text-primary">{selectedField.label}</h2>
                    {selectedField.kind === "options" && selectedField.options.length > 5 && (
                      <span className="shrink-0 text-xs text-text-muted">{selectedCount(selectedField, params)} of {selectedField.options.length}</span>
                    )}
                  </header>

                  {selectedField.kind === "options" && (
                    <label className="relative mx-4 mt-3 block">
                      <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="search"
                        value={optionSearch}
                        onChange={(event) => setOptionSearch(event.target.value)}
                        placeholder={`Search ${selectedField.label.toLowerCase()}`}
                        aria-label={`Search ${selectedField.label.toLowerCase()}`}
                        className="min-h-10 w-full rounded-md border border-border-default bg-surface py-2 pl-9 pr-3 text-sm"
                      />
                    </label>
                  )}

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {selectedField.kind === "options" && (
                      <fieldset className="space-y-1">
                        <legend className="sr-only">{selectedField.label}</legend>
                        {visibleOptions.map((option) => (
                          <label key={option.value} className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-neutral-50">
                            <input
                              type="checkbox"
                              checked={optionIsSelected(selectedField, option, params)}
                              onChange={() => toggleOption(selectedField, option)}
                              className="size-4 accent-brand-primary"
                            />
                            {selectedField.key === "status"
                              ? <StatusBadge status={option.label} showDot={false} />
                              : <span className="truncate">{option.label}</span>}
                          </label>
                        ))}
                        {!visibleOptions.length && <p className="py-6 text-center text-sm text-text-muted">No matching options.</p>}
                      </fieldset>
                    )}
                    {selectedField.kind === "range" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-text-secondary">From</span>
                          <input type={selectedField.inputType} min={selectedField.inputType === "number" ? 0 : undefined} step={selectedField.step} value={params.get(selectedField.fromKey) ?? ""} onChange={(event) => updateQuery((next) => event.target.value ? next.set(selectedField.fromKey, event.target.value) : next.delete(selectedField.fromKey))} className="min-h-10 w-full rounded-md border border-border-default px-3 text-sm" />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-text-secondary">To</span>
                          <input type={selectedField.inputType} min={selectedField.inputType === "number" ? 0 : undefined} step={selectedField.step} value={params.get(selectedField.toKey) ?? ""} onChange={(event) => updateQuery((next) => event.target.value ? next.set(selectedField.toKey, event.target.value) : next.delete(selectedField.toKey))} className="min-h-10 w-full rounded-md border border-border-default px-3 text-sm" />
                        </label>
                      </div>
                    )}
                    {selectedField.kind === "value" && (
                      <label className="space-y-1.5">
                        <span className="text-xs font-medium text-text-secondary">{selectedField.label}</span>
                        <input type={selectedField.inputType} value={params.get(selectedField.key) ?? ""} onChange={(event) => updateQuery((next) => event.target.value ? next.set(selectedField.key, event.target.value) : next.delete(selectedField.key))} className="min-h-10 w-full rounded-md border border-border-default px-3 text-sm" />
                      </label>
                    )}
                    {selectedField.kind === "text" && (
                      <label className="space-y-1.5">
                        <span className="text-xs font-medium text-text-secondary">{selectedField.label}</span>
                        <input type="search" value={params.get(selectedField.key) ?? ""} onChange={(event) => updateQuery((next) => event.target.value ? next.set(selectedField.key, event.target.value) : next.delete(selectedField.key))} placeholder="Search tasks" className="min-h-10 w-full rounded-md border border-border-default px-3 text-sm" />
                      </label>
                    )}
                    {selectedField.kind === "toggle" && (
                      <label className="flex min-h-10 items-center gap-2 text-sm text-text-secondary">
                        <input type="checkbox" checked={params.get(selectedField.key) === "true"} onChange={(event) => updateQuery((next) => event.target.checked ? next.set(selectedField.key, "true") : next.delete(selectedField.key))} className="size-4 accent-brand-primary" />
                        {selectedField.label}
                      </label>
                    )}
                  </div>

                  <footer className="flex items-center justify-between gap-2 border-t border-border-default px-4 py-3">
                    <button type="button" onClick={clearAll} disabled={!activeCount} className="min-h-8 rounded-md px-2 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-neutral-100 disabled:opacity-50">Clear all</button>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => clearField(selectedField)} disabled={!selectedCount(selectedField, params)} className="min-h-8 rounded-md px-2 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-neutral-100 disabled:opacity-50">Clear</button>
                      <span className="text-xs tabular-nums text-text-muted">{selectedCount(selectedField, params)} selected</span>
                    </div>
                  </footer>
                </>
              ) : (
                <p className="p-5 text-sm text-text-muted">Add a field to filter tasks.</p>
              )}
            </div>
          </section>
        )}
    </div>
  );
}

export function TaskBoardAppliedFilters({ fields }: { fields: TaskBoardFilterField[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const activeFields = fields.flatMap((field) => {
    const summary = fieldSummary(field, params);
    return summary ? [{ field, summary }] : [];
  });

  function clearField(field: TaskBoardFilterField) {
    const next = new URLSearchParams(params);
    queryKeys(field).forEach((key) => next.delete(key));
    next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {activeFields.map(({ field, summary }) => (
        <button
          key={field.key}
          type="button"
          onClick={() => clearField(field)}
          aria-label={`Remove ${field.label} filter: ${summary}`}
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border-default bg-surface px-3 text-xs text-text-secondary transition-colors duration-150 hover:bg-neutral-50"
        >
          <span className="truncate"><span className="font-medium text-text-primary">{field.label}:</span> {summary}</span>
          <X size={13} aria-hidden="true" className="shrink-0" />
        </button>
      ))}
    </div>
  );
}
