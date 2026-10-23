import type { MetadataFieldDefinition } from "@/lib/validations/metadata";

export function metadataCsvHeaders(fields: MetadataFieldDefinition[]) {
  const labelCounts = new Map<string, number>();
  const headers = new Map<string, string>();
  for (const field of fields) {
    const count = (labelCounts.get(field.label) ?? 0) + 1;
    labelCounts.set(field.label, count);
    const suffix = count > 1 ? ` (${count})` : "";
    headers.set(`Custom field: ${field.label}${suffix}`, field.key);
  }
  return headers;
}

export function parseMetadataCsvValues(
  fields: MetadataFieldDefinition[],
  row: Record<string, string>,
  headers: Map<string, string>,
) {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const values: Record<string, string | number | boolean | string[]> = {};
  for (const [header, key] of headers) {
    const value = row[header] ?? "";
    if (!value.trim()) continue;
    const field = fieldsByKey.get(key);
    if (!field) continue;
    if (field.type === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return { error: `${field.label} must be a number.` as const };
      values[key] = parsed;
    } else if (field.type === "boolean") {
      const normalized = value.trim().toLowerCase();
      if (!["true", "false", "yes", "no"].includes(normalized)) return { error: `${field.label} must be Yes or No.` as const };
      values[key] = normalized === "true" || normalized === "yes";
    } else if (field.type === "multi-select") {
      const selected = value.split("|").map((item) => item.trim()).filter(Boolean);
      const invalid = selected.find((item) => !field.options?.includes(item));
      if (invalid) return { error: `${field.label} contains an unsupported option.` as const };
      values[key] = selected;
    } else if (field.type === "select" && !field.options?.includes(value)) {
      return { error: `${field.label} contains an unsupported option.` as const };
    } else {
      values[key] = value;
    }
  }
  return { error: null, values };
}
