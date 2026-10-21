import { z } from "zod";
import { DEPLOYMENT_STATUSES } from "@/lib/constants";

const deploymentFields = z.object({
  memberId: z.string().uuid().optional(),
  memberIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  projectId: z.string().uuid(),
  title: z.string().trim().max(160).nullable().optional(),
  deploymentType: z.string().trim().max(100).nullable().optional(),
  location: z.string().trim().min(2).max(160),
  country: z.string().trim().max(100).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(DEPLOYMENT_STATUSES).optional(),
  checklist: z.array(z.object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(160),
    complete: z.boolean(),
  })).max(100).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.json()).nullable().optional(),
});

export const deploymentCreateSchema = deploymentFields
  .refine((value) => Boolean(value.memberIds?.length || value.memberId), {
    path: ["memberIds"],
    message: "Select at least one active member.",
  })
  .refine((value) => new Set(value.memberIds ?? []).size === (value.memberIds ?? []).length, {
    path: ["memberIds"],
    message: "Choose each member only once.",
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  });

export const deploymentUpdateSchema = deploymentFields
  .partial()
  .refine((value) => !value.memberIds || new Set(value.memberIds).size === value.memberIds.length, {
    path: ["memberIds"],
    message: "Choose each member only once.",
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  });

export const deploymentConflictSchema = z.array(z.object({
  memberId: z.string().uuid().optional(),
  allocationId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectCode: z.string(),
  projectTitle: z.string(),
  weekStartDate: z.string(),
  weekEndDate: z.string(),
  deploymentStartDate: z.string(),
  deploymentEndDate: z.string(),
  plannedHrs: z.number(),
  allocationPct: z.number(),
  mode: z.string(),
}));
