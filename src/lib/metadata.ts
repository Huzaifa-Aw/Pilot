import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  metadataFieldSchema,
  metadataValuesSchema,
  type MetadataFieldDefinition,
} from "@/lib/validations/metadata";
import type { MetadataInputValues } from "@/types/metadata";

export async function getDefaultMetadataFields(
  organizationId: string,
  entityType: "project" | "milestone" | "member" | "asset" | "task",
  client: typeof db | Prisma.TransactionClient = db,
) {
  const templates = await client.metadataTemplate.findMany({
    where: { organizationId, entityType, isDefault: true },
    select: { fields: true },
    take: 2,
  });
  if (templates.length > 1) {
    throw new Error(`Multiple default ${entityType} metadata templates exist for one organization.`);
  }
  if (!templates.length) return [];

  const parsedFields = metadataFieldSchema.array().safeParse(templates[0].fields);
  if (!parsedFields.success) {
    throw new Error(`The default ${entityType} metadata template is invalid.`);
  }
  return parsedFields.data;
}

function isMetadataFieldValueValid(field: MetadataFieldDefinition, value: unknown) {
  switch (field.type) {
    case "text":
    case "textarea":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "boolean":
      return typeof value === "boolean";
    case "select":
      return typeof value === "string" && Boolean(field.options?.includes(value));
    case "multi-select":
      return Array.isArray(value) && value.every(
        (item) => typeof item === "string" && Boolean(field.options?.includes(item)),
      );
  }
}

export function validateMetadataAgainstFields(
  fields: MetadataFieldDefinition[],
  values: Record<string, unknown>,
  preservedKeys: ReadonlySet<string> = new Set(),
) {
  const keys = Object.keys(values);
  const fieldKeys = new Set(fields.map((field) => field.key));
  const unknownKey = keys.find((key) => !fieldKeys.has(key));
  if (unknownKey && !preservedKeys.has(unknownKey)) {
    return `The custom field "${unknownKey}" is not configured for this organization.`;
  }

  for (const field of fields) {
    const value = values[field.key];
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (preservedKeys.has(field.key)) continue;
      if (field.required) return `Complete the required custom field "${field.label}".`;
      continue;
    }

    const valid = isMetadataFieldValueValid(field, value);
    if (preservedKeys.has(field.key) && !valid) continue;
    if (!valid) return `Check the value for custom field "${field.label}".`;
  }

  return null;
}

export async function prepareMetadataValues(
  organizationId: string,
  entityType: "project" | "milestone" | "member" | "asset" | "task",
  submitted: unknown,
  existing?: unknown,
  client: typeof db | Prisma.TransactionClient = db,
) {
  const parsedSubmitted = metadataValuesSchema.safeParse(submitted);
  if (!parsedSubmitted.success) {
    return { error: "Custom values must be valid JSON data." as const };
  }
  const parsedExisting = existing === undefined || existing === null
    ? { success: true as const, data: {} }
    : metadataValuesSchema.safeParse(existing);
  if (!parsedExisting.success) {
    throw new Error(`Stored ${entityType} custom values are not valid JSON.`);
  }

  const fields = await getDefaultMetadataFields(organizationId, entityType, client);
  const fieldKeys = new Set(fields.map((field) => field.key));
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const legacyValues = Object.fromEntries(Object.entries(parsedExisting.data).filter(([key, value]) => {
    const field = fieldsByKey.get(key);
    return !field || !isMetadataFieldValueValid(field, value);
  }));
  const submittedValues = parsedSubmitted.data;
  const unconfiguredSubmission = Object.keys(submittedValues).find(
    (key) => !fieldKeys.has(key) && !Object.hasOwn(parsedExisting.data, key),
  );
  if (unconfiguredSubmission) {
    return { error: `The custom field "${unconfiguredSubmission}" is not configured for this organization.` as const };
  }
  const modifiedLegacy = Object.entries(submittedValues).find(([key, value]) => {
    if (!Object.hasOwn(legacyValues, key)) return false;
    const field = fieldsByKey.get(key);
    if (!field) return JSON.stringify(value) !== JSON.stringify(legacyValues[key]);
    return isMetadataFieldValueValid(field, value) &&
      JSON.stringify(value) !== JSON.stringify(legacyValues[key]);
  });
  if (modifiedLegacy) {
    return { error: `Custom field "${modifiedLegacy[0]}" is not editable until it is added back to the template.` as const };
  }

  const configuredValues = Object.fromEntries(
    Object.entries(submittedValues).filter(([key, value]) => {
      const field = fieldsByKey.get(key);
      return field && !Object.hasOwn(legacyValues, key) && isMetadataFieldValueValid(field, value);
    }),
  );
  const values = { ...legacyValues, ...configuredValues };
  const error = validateMetadataAgainstFields(fields, values, new Set(Object.keys(legacyValues)));
  if (error) return { error };

  return {
    error: null,
    values: values as Prisma.InputJsonObject,
  };
}

export function metadataValuesForFields(
  fields: MetadataFieldDefinition[],
  rawValues: unknown,
): MetadataInputValues {
  const parsedValues = metadataValuesSchema.safeParse(rawValues);
  if (!parsedValues.success) {
    throw new Error("Stored custom values are not valid JSON.");
  }
  const values = parsedValues.data;

  const result: MetadataInputValues = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    if (!isMetadataFieldValueValid(field, value)) continue;

    switch (field.type) {
      case "text":
      case "textarea":
      case "date":
      case "select":
        if (typeof value !== "string") continue;
        result[field.key] = value;
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        result[field.key] = value;
        break;
      case "boolean":
        if (typeof value !== "boolean") continue;
        result[field.key] = value;
        break;
      case "multi-select":
        if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
          continue;
        }
        result[field.key] = value;
        break;
    }
  }
  return result;
}

export function unconfiguredMetadataValues(
  fields: MetadataFieldDefinition[],
  rawValues: unknown,
) {
  const parsed = metadataValuesSchema.safeParse(rawValues);
  if (!parsed.success) throw new Error("Stored custom values are not valid JSON.");
  const allowed = new Set(fields.map((field) => field.key));
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  return Object.entries(parsed.data)
    .filter(([key, value]) => {
      const field = fieldsByKey.get(key);
      return !allowed.has(key) || Boolean(field && !isMetadataFieldValueValid(field, value));
    })
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : Array.isArray(value)
          ? value.map(String).join(", ")
          : JSON.stringify(value) ?? "",
    }));
}

export async function validateMetadataValues(
  organizationId: string,
  entityType: "project" | "milestone" | "member" | "asset" | "task",
  values: unknown,
) {
  const parsedValues = metadataValuesSchema.safeParse(values);
  if (!parsedValues.success) return "Custom values must be valid JSON data.";

  const valuesObject = parsedValues.data;
  const fields = await getDefaultMetadataFields(organizationId, entityType);
  if (!fields.length) {
    return Object.keys(valuesObject).length
      ? "Configure a default metadata template before adding custom values."
      : null;
  }
  return validateMetadataAgainstFields(fields, valuesObject);
}
