import { z } from "zod";
import { PROJECT_STATUSES } from "@/lib/constants";
import { dateInputSchema, metadataObjectSchema } from "./shared";

const hoursField = z
  .union([z.literal(""), z.number().finite().min(0), z.null()])
  .optional()
  .transform((value) => value === "" || value === undefined ? null : value);

const projectFields = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  workflowId: z.string().uuid().optional(),
  startDate: dateInputSchema.optional(),
  endDate: dateInputSchema.optional(),
  budgetHours: hoursField,
  metadata: metadataObjectSchema.optional(),
  tags: z
    .union([
      z.array(z.string().trim().min(1).max(48)).max(30),
      z.string().max(1500),
    ])
    .optional()
    .transform((value) =>
      typeof value === "string"
        ? value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30)
        : value,
    ),
});

function validProjectRange(value: { startDate?: Date | null; endDate?: Date | null }) {
  return !value.startDate || !value.endDate || value.endDate >= value.startDate;
}

export const projectCreateSchema = projectFields.refine(
  validProjectRange,
  { path: ["endDate"], message: "End date must be on or after the start date." },
);

export const projectUpdateSchema = projectFields.partial().refine(
  validProjectRange,
  { path: ["endDate"], message: "End date must be on or after the start date." },
);
