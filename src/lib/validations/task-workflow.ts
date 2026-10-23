import { z } from "zod";
import { TASK_STATUSES } from "@/lib/constants";

const statusSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  name: z.string().trim().min(1).max(80),
  category: z.enum(TASK_STATUSES),
  sortOrder: z.number().int().min(0).max(100),
  isInitial: z.boolean(),
  requiredFieldKeys: z.array(z.string().trim().min(1).max(64)).max(100),
});

const workflowFields = z.object({
  name: z.string().trim().min(2).max(100),
  statuses: z.array(statusSchema).min(2).max(30),
  transitions: z.array(z.object({
    fromKey: z.string().trim().min(1).max(64),
    toKey: z.string().trim().min(1).max(64),
  })).max(900),
});

function validateWorkflow({
  statuses,
  transitions,
}: z.infer<typeof workflowFields>) {
  const keys = new Set(statuses.map(({ key }) => key));
  return new Set(statuses.map(({ key }) => key)).size === statuses.length &&
    statuses.filter(({ isInitial }) => isInitial).length === 1 &&
    transitions.every(({ fromKey, toKey }) => keys.has(fromKey) && keys.has(toKey) && fromKey !== toKey) &&
    new Set(transitions.map(({ fromKey, toKey }) => `${fromKey}:${toKey}`)).size === transitions.length;
}

export const taskWorkflowCreateSchema = workflowFields.refine(validateWorkflow, {
  path: ["statuses"],
  message: "Use unique status keys, exactly one starting status, and valid unique transitions.",
});

export const taskWorkflowUpdateSchema = workflowFields.extend({
  isDefault: z.boolean().optional(),
}).refine(validateWorkflow, {
  path: ["statuses"],
  message: "Use unique status keys, exactly one starting status, and valid unique transitions.",
});

export const taskLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(["neutral", "blue", "green", "amber", "red"]),
});
