import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { dateInputSchema, metadataObjectSchema } from "./shared";

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  blockedByTaskId: z.string().uuid().nullable().optional(),
  requiredDiscipline: z.string().trim().max(100).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  startDate: dateInputSchema.optional(),
  estimatedHrs: z.number().finite().min(0).nullable().optional(),
  dueDate: dateInputSchema.optional(),
  metadata: metadataObjectSchema.optional(),
  assigneeIds: z.array(z.string().uuid()).max(50).optional(),
});

export const taskUpdateSchema = taskCreateSchema
  .omit({ assigneeIds: true })
  .partial()
  .extend({
    actualHrs: z.number().finite().min(0).optional(),
    sortOrder: z.number().finite().optional(),
    assigneeIds: z.array(z.string().uuid()).max(50).optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "updatedAt"), "Provide at least one task change.");
