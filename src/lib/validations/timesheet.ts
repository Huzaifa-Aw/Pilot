import { z } from "zod";

const hours = z.number().finite().min(0).max(24);

export const timesheetCreateSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable().optional(),
  weekStartDate: z.coerce.date(),
  monday: hours.default(0),
  tuesday: hours.default(0),
  wednesday: hours.default(0),
  thursday: hours.default(0),
  friday: hours.default(0),
  notes: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => value.weekStartDate.getUTCDay() === 1, {
  path: ["weekStartDate"],
  message: "Choose a Monday as the start of the timesheet week.",
});

export const timesheetUpdateSchema = z.object({
  monday: hours.optional(),
  tuesday: hours.optional(),
  wednesday: hours.optional(),
  thursday: hours.optional(),
  friday: hours.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["SUBMITTED", "APPROVED", "FLAGGED"]).optional(),
});
