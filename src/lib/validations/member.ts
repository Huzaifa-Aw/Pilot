import { z } from "zod";
import { MEMBER_ROLES } from "@/lib/constants";
import { dateInputSchema, metadataObjectSchema } from "./shared";

export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  role: z.enum(MEMBER_ROLES).default("ENGINEER"),
  title: z.string().trim().max(120).optional(),
});

export const memberUpdateSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  discipline: z.string().trim().max(100).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(3000).nullable().optional(),
  employmentType: z.union([z.enum(["EMPLOYEE", "CONTRACTOR", "INTERN", "OTHER"]), z.literal(""), z.null()])
    .transform((value) => value === "" ? null : value).optional(),
  startDate: dateInputSchema.optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  dailyCapacityHrs: z.number().finite().min(0.25).max(24).optional(),
  languages: z.string().trim().max(1000).transform((value) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]).optional(),
  preferredWorkMode: z.union([z.enum(["REMOTE", "ON_SITE", "HYBRID", "FLEXIBLE"]), z.literal(""), z.null()])
    .transform((value) => value === "" ? null : value).optional(),
  certifications: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    issuer: z.string().trim().max(160).nullable().optional(),
    issuedOn: dateInputSchema.optional(),
    expiresOn: dateInputSchema.optional(),
    credentialId: z.string().trim().max(160).nullable().optional(),
  })).max(100).optional(),
  reportsToMemberId: z.union([z.string().uuid(), z.literal(""), z.null()])
    .transform((value) => value === "" ? null : value).optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(32).nullable().optional(),
  skills: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    level: z.number().int().min(1).max(5),
    yearsExperience: z.number().finite().min(0).max(80).nullable().optional(),
  })).max(100).optional(),
  capacityHrsPerWeek: z.number().finite().min(0).max(168).optional(),
  metadata: metadataObjectSchema.nullable().optional(),
  role: z.enum(MEMBER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(32).max(128),
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(12).max(128).optional(),
});
