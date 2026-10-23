import type { Prisma, TaskPriority } from "@prisma/client";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";

export type TaskMetadataFilter = { field: MetadataFieldDefinition; value: string };

export type TaskFilters = {
  projectId?: string;
  workflowStatusId?: string;
  priority?: TaskPriority;
  milestoneId?: string;
  assigneeId?: string;
  reporterMemberId?: string;
  mine?: boolean;
  currentMemberId?: string;
  labelId?: string;
  flagged?: boolean;
  parent?: "has" | "none";
  blocked?: "has" | "none";
  requiredDiscipline?: string;
  search?: string;
  startFrom?: Date;
  startTo?: Date;
  dueFrom?: Date;
  dueTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  completedFrom?: Date;
  completedTo?: Date;
  estimateMin?: number;
  estimateMax?: number;
  actualMin?: number;
  actualMax?: number;
  metadata?: TaskMetadataFilter[];
};

function metadataFilter(field: MetadataFieldDefinition, value: string): Prisma.TaskWhereInput | null {
  if (field.type === "boolean") {
    if (value !== "true" && value !== "false") return null;
    return { metadata: { path: [field.key], equals: value === "true" } };
  }
  if (field.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return { metadata: { path: [field.key], equals: parsed } };
  }
  if (field.type === "multi-select") {
    if (!field.options?.includes(value)) return null;
    return { metadata: { path: [field.key], array_contains: [value] } };
  }
  if (field.type === "select" && !field.options?.includes(value)) return null;
  if (!value.trim()) return null;
  return { metadata: { path: [field.key], equals: value } };
}

export function taskFilterWhere(organizationId: string, filters: TaskFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { organizationId };
  const conditions: Prisma.TaskWhereInput[] = [];
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.workflowStatusId) where.workflowStatusId = filters.workflowStatusId;
  if (filters.priority) where.priority = filters.priority;
  if (filters.milestoneId) where.milestoneId = filters.milestoneId;
  if (filters.assigneeId) where.assignments = { some: { organizationId, memberId: filters.assigneeId } };
  if (filters.reporterMemberId) where.reporterMemberId = filters.reporterMemberId;
  if (filters.mine && filters.currentMemberId) conditions.push({ assignments: { some: { organizationId, memberId: filters.currentMemberId } } });
  if (filters.labelId) where.labels = { some: { organizationId, labelId: filters.labelId } };
  if (filters.flagged !== undefined) where.flaggedAt = filters.flagged ? { not: null } : null;
  if (filters.parent) where.parentTaskId = filters.parent === "has" ? { not: null } : null;
  if (filters.blocked) where.blockedByTaskId = filters.blocked === "has" ? { not: null } : null;
  if (filters.requiredDiscipline) where.requiredDiscipline = { equals: filters.requiredDiscipline, mode: "insensitive" };
  if (filters.search) {
    const taskNumber = Number(filters.search.replace(/^\D+/, ""));
    conditions.push({ OR: [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { project: { organizationId, code: { contains: filters.search, mode: "insensitive" } } },
      ...(Number.isSafeInteger(taskNumber) && taskNumber > 0 ? [{ taskNumber }] : []),
    ] });
  }
  if (filters.startFrom || filters.startTo) {
    where.startDate = {
      ...(filters.startFrom ? { gte: filters.startFrom } : {}),
      ...(filters.startTo ? { lte: filters.startTo } : {}),
    };
  }
  if (filters.dueFrom || filters.dueTo) {
    where.dueDate = {
      ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
      ...(filters.dueTo ? { lte: filters.dueTo } : {}),
    };
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {
      ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
      ...(filters.createdTo ? { lte: filters.createdTo } : {}),
    };
  }
  if (filters.updatedFrom || filters.updatedTo) {
    where.updatedAt = {
      ...(filters.updatedFrom ? { gte: filters.updatedFrom } : {}),
      ...(filters.updatedTo ? { lte: filters.updatedTo } : {}),
    };
  }
  if (filters.completedFrom || filters.completedTo) {
    where.completedAt = {
      ...(filters.completedFrom ? { gte: filters.completedFrom } : {}),
      ...(filters.completedTo ? { lte: filters.completedTo } : {}),
    };
  }
  if (filters.estimateMin !== undefined || filters.estimateMax !== undefined) {
    where.estimatedHrs = {
      ...(filters.estimateMin !== undefined ? { gte: filters.estimateMin } : {}),
      ...(filters.estimateMax !== undefined ? { lte: filters.estimateMax } : {}),
    };
  }
  if (filters.actualMin !== undefined || filters.actualMax !== undefined) {
    where.actualHrs = {
      ...(filters.actualMin !== undefined ? { gte: filters.actualMin } : {}),
      ...(filters.actualMax !== undefined ? { lte: filters.actualMax } : {}),
    };
  }
  for (const item of filters.metadata ?? []) {
    const condition = metadataFilter(item.field, item.value);
    if (condition) conditions.push(condition);
  }
  if (conditions.length) where.AND = conditions;
  return where;
}
