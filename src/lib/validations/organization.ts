import { z } from "zod";
import { slugSchema } from "./shared";

const timezoneSchema = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Choose a valid time zone.");

const localeSchema = z.string().trim().min(2).max(20).refine((value) => {
  try {
    Intl.getCanonicalLocales(value);
    return true;
  } catch {
    return false;
  }
}, "Choose a valid locale.");

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
});

export const organizationUpdateSchema = organizationCreateSchema.partial().extend({
  logoUrl: z.preprocess((value) => value === "" ? null : value, z.string().url().max(2048).nullable().optional()),
  website: z.preprocess((value) => value === "" ? null : value, z.string().url().max(2048).nullable().optional()),
  industry: z.preprocess((value) => value === "" ? null : value, z.string().trim().max(100).nullable().optional()),
  timezone: timezoneSchema.optional(),
  locale: localeSchema.optional(),
});
