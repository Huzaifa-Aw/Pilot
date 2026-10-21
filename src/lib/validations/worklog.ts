import { z } from "zod";

export const worklogCreateSchema = z.object({
  memberId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  date: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
  hours: z.number().finite().min(0.25).max(24),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  billable: z.boolean().optional(),
}).refine((value) => Boolean(value.projectId || value.category), {
  message: "Choose a project or a non-project time category.",
  path: ["category"],
});

export const worklogUpdateSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  date: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  hours: z.number().finite().min(0.25).max(24).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  billable: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one change.");
