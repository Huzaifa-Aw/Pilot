import { z } from "zod";

const allocationValues = {
  plannedHrs: z.number().finite().min(0).max(168),
  allocationPct: z.number().finite().min(0).max(100),
  mode: z.enum(["Remote", "On-Site", "Hybrid"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};

export const allocationCreateSchema = z.object({
  memberId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  ...allocationValues,
}).refine((value) => value.startDate <= value.endDate, {
  path: ["endDate"],
  message: "End date must be on or after the start date.",
}).refine((value) => {
  const first = mondayFor(value.startDate);
  const last = mondayFor(value.endDate);
  return Math.floor((last.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)) < 12;
}, {
  path: ["endDate"],
  message: "Choose a range of 12 weeks or less.",
});

export const allocationUpdateSchema = z.object({
  weekStartDate: z.coerce.date().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  plannedHrs: allocationValues.plannedHrs.optional(),
  allocationPct: allocationValues.allocationPct.optional(),
  mode: allocationValues.mode,
  notes: allocationValues.notes,
}).partial().refine((value) => !value.weekStartDate || value.weekStartDate.getUTCDay() === 1, {
  path: ["weekStartDate"],
  message: "Choose a Monday as the start of the allocation week.",
});

function mondayFor(date: Date) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}
