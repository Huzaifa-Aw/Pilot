import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const idSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");
export const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));
export const dateInputSchema = z
  .union([z.literal(""), z.iso.date(), z.iso.datetime(), z.null()])
  .transform((value) =>
    value === "" || value === null
      ? null
      : new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value),
  );

function isJsonInputValue(value: unknown): value is Prisma.InputJsonValue | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonInputValue);
  if (typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isJsonInputValue);
}

export const metadataObjectSchema = z.record(
  z.string(),
  z.custom<Prisma.InputJsonValue | null>(isJsonInputValue, "Custom field values have an unsupported format."),
);

export function parsePage(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Number(searchParams.get("pageSize") ?? 20);
  return {
    page: Number.isSafeInteger(page) ? Math.max(1, page) : 1,
    pageSize: Number.isSafeInteger(pageSize) ? Math.min(100, Math.max(1, pageSize)) : 20,
  };
}
