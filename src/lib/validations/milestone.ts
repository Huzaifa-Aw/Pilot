import { z } from "zod";
import { MILESTONE_STATUSES } from "@/lib/constants";
import { dateInputSchema, metadataObjectSchema } from "./shared";

export const milestoneCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).optional(),
  sequenceNumber: z.number().int().min(1).optional(),
  startDate: dateInputSchema.optional(),
  targetDate: dateInputSchema.optional(),
  requiresSignoff: z.boolean().optional(),
  metadata: metadataObjectSchema.optional(),
});

export const milestoneUpdateSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  sequenceNumber: z.number().int().min(1).optional(),
  startDate: dateInputSchema.optional(),
  targetDate: dateInputSchema.optional(),
  requiresSignoff: z.boolean().optional(),
  signoffByMemberId: z.string().uuid().nullable().optional(),
  metadata: metadataObjectSchema.nullable().optional(),
  updatedAt: z.iso.datetime().optional(),
});
