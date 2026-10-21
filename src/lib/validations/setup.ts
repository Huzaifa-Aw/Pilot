import { z } from "zod";
import { slugSchema } from "./shared";

export const setupSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  organizationSlug: slugSchema,
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
});
