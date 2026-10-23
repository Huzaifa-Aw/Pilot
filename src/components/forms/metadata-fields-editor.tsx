"use client";

import { Input } from "@/components/ui/input";
import type { MetadataInputValues } from "@/types/metadata";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";

export function MetadataFieldsEditor({
  fields,
  values,
  onChange,
}: {
  fields: MetadataFieldDefinition[];
  values: MetadataInputValues;
  onChange: (key: string, value: string | number | boolean | string[] | null) => void;
}) {
  if (!fields.length) return null;
  const sections = [...fields].sort((a, b) => a.order - b.order).reduce<Array<[string, MetadataFieldDefinition[]]>>((groups, field) => {
    const section = field.section?.trim() || "Additional details";
    const group = groups.find(([name]) => name === section);
    if (group) group[1].push(field);
    else groups.push([section, [field]]);
    return groups;
  }, []);

  return (
    <fieldset className="space-y-4 border-t border-border-default pt-5">
      <legend className="px-1 text-sm font-semibold text-text-primary">Organization-defined details</legend>
      <div className="space-y-5">
        {sections.map(([section, sectionFields]) => (
          <fieldset key={section} className="space-y-3">
            <legend className="text-sm font-medium text-text-secondary">{section}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {sectionFields.map((field) => {
                const id = `metadata-${field.key}`;
                const value = values[field.key];
                return (
                  <div key={field.key} className={`space-y-2 ${field.type === "textarea" || field.type === "multi-select" ? "sm:col-span-2" : ""}`}>
                    {field.type !== "boolean" && (
                      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
                        {field.label}{field.required && <span aria-hidden="true" className="ml-1 text-error-dark">*</span>}
                        {field.required && <span className="sr-only"> required</span>}
                      </label>
                    )}
                    {field.type === "text" && (
                      <Input id={id} required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} />
                    )}
                    {field.type === "number" && (
                      <div className="flex items-center gap-2">
                        <Input id={id} type="number" inputMode="decimal" required={field.required} value={typeof value === "number" ? value : ""} onChange={(event) => onChange(field.key, event.target.value === "" ? null : Number(event.target.value))} />
                        {field.unit && <span className="shrink-0 text-xs text-text-muted">{field.unit}</span>}
                      </div>
                    )}
                    {field.type === "date" && (
                      <Input id={id} type="date" required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value || null)} />
                    )}
                    {field.type === "select" && (
                      <select id={id} required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15">
                        <option value="">Choose an option</option>
                        {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    )}
                    {field.type === "multi-select" && (
                      <div className="rounded-md border border-border-default bg-surface p-2">
                        {(field.options ?? []).map((option) => {
                          const selected = Array.isArray(value) && value.includes(option);
                          return (
                            <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 text-sm text-text-secondary hover:bg-neutral-50">
                              <input
                                type="checkbox"
                                className="size-4 accent-brand-primary"
                                checked={selected}
                                onChange={(event) => {
                                  const current = Array.isArray(value) ? value : [];
                                  onChange(field.key, event.target.checked ? [...current, option] : current.filter((item) => item !== option));
                                }}
                              />
                              {option}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {field.type === "boolean" && (
                      <label className="flex min-h-11 items-center gap-3 rounded-md border border-border-default bg-surface px-3 text-sm font-medium text-text-secondary">
                        <input id={id} type="checkbox" className="size-4 accent-brand-primary" checked={value === true} onChange={(event) => onChange(field.key, event.target.checked)} />
                        {field.label}{field.required && <span aria-hidden="true" className="text-error-dark">*</span>}
                      </label>
                    )}
                    {field.type === "textarea" && (
                      <textarea id={id} required={field.required} rows={3} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} className="w-full resize-y rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15" />
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-text-muted">Fields are configured by your organization.</p>
    </fieldset>
  );
}

export function MetadataValuesDisplay({
  fields,
  values,
  unconfigured = [],
}: {
  fields: MetadataFieldDefinition[];
  values: Record<string, unknown>;
  unconfigured?: Array<{ key: string; value: string }>;
}) {
  const present = [...fields]
    .filter((field) => values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== "")
    .sort((a, b) => a.order - b.order);
  if (!present.length && !unconfigured.length) return null;

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border-default pt-4 sm:grid-cols-2">
      {present.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-xs font-medium text-text-muted">{field.label}</dt>
          <dd className="mt-1 break-words text-sm text-text-primary">
            {formatMetadataValue(values[field.key], field.unit)}
          </dd>
        </div>
      ))}
      {unconfigured.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-xs font-medium text-text-muted">{humanizeFieldName(field.key)}</dt>
          <dd className="mt-1 break-words text-sm text-text-secondary">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function humanizeFieldName(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatMetadataValue(value: unknown, unit?: string) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ");
  if (typeof value === "string" || typeof value === "number") return `${value}${unit ? ` ${unit}` : ""}`;
  return "—";
}
