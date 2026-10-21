import { z } from "zod";
import { metadataObjectSchema } from "./shared";

export const assetCreateSchema = z.object({
  assetCode: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(10000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(),
  acquiredOn: z.union([z.literal(""), z.coerce.date()]).transform((value) => value === "" ? null : value).nullable().optional(),
  nextServiceDate: z.union([z.literal(""), z.coerce.date()]).transform((value) => value === "" ? null : value).nullable().optional(),
  status: z.string().trim().min(1).max(40).optional(),
  metadata: metadataObjectSchema.optional(),
});

export const assetUpdateSchema = assetCreateSchema.partial();

export const assetCheckoutSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("checkout"),
    memberId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    deploymentId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  z.object({ action: z.literal("return") }),
]);
