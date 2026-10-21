import { z } from "zod";

const allocationFields = z.object({
  memberId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable().optional(),
  weekStartDate: z.coerce.date(),
  plannedHrs: z.number().finite().min(0).max(168),
  allocationPct: z.number().finite().min(0).max(100),
  mode: z.enum(["Remote", "On-Site", "Hybrid"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const allocationCreateSchema = allocationFields.refine((value) => value.weekStartDate.getUTCDay() === 1, {
  path: ["weekStartDate"],
  message: "Choose a Monday as the start of the allocation week.",
});

export const allocationUpdateSchema = allocationFields
  .omit({ memberId: true })
  .partial()
  .refine((value) => !value.weekStartDate || value.weekStartDate.getUTCDay() === 1, {
    path: ["weekStartDate"],
    message: "Choose a Monday as the start of the allocation week.",
  });
