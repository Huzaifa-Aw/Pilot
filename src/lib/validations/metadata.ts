import { z } from "zod";
import { METADATA_ENTITY_TYPES } from "@/lib/constants";
import { metadataObjectSchema } from "./shared";

export const metadataFieldSchema = z.object({
  key: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(100),
  type: z.enum(["text", "number", "date", "select", "multi-select", "boolean", "textarea"]),
  options: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  required: z.boolean().optional(),
  section: z.string().trim().max(100).optional(),
  order: z.number().int().min(0).max(1000),
  unit: z.string().trim().max(24).optional(),
});
export type MetadataFieldDefinition = z.infer<typeof metadataFieldSchema>;

const templateFieldsSchema = z.object({
  entityType: z.enum(METADATA_ENTITY_TYPES),
  name: z.string().trim().min(2).max(120),
  fields: z.array(metadataFieldSchema).max(100),
  isDefault: z.boolean().optional(),
});

function hasUniqueFieldKeys(fields: MetadataFieldDefinition[]) {
  return new Set(fields.map((field) => field.key)).size === fields.length;
}

function fieldsHaveOptions(fields: MetadataFieldDefinition[]) {
  return fields.every((field) =>
    !["select", "multi-select"].includes(field.type) || (field.options?.length ?? 0) > 0,
  );
}

export const metadataTemplateCreateSchema = templateFieldsSchema.refine(
  ({ fields }) => new Set(fields.map((field) => field.key)).size === fields.length,
  { path: ["fields"], message: "Field keys must be unique." },
).refine(
  ({ fields }) => fieldsHaveOptions(fields),
  { path: ["fields"], message: "Select fields require at least one option." },
);

export const metadataTemplateUpdateSchema = templateFieldsSchema
  .omit({ entityType: true })
  .partial()
  .refine(({ fields }) => fields === undefined || hasUniqueFieldKeys(fields), {
    path: ["fields"],
    message: "Field keys must be unique.",
  })
  .refine(({ fields }) => fields === undefined || fieldsHaveOptions(fields), {
    path: ["fields"],
    message: "Select fields require at least one option.",
  });

export const metadataValuesSchema = metadataObjectSchema;
