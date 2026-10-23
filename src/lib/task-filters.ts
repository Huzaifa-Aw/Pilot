import type { Prisma, TaskPriority } from "@prisma/client";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";

export type TaskMetadataFilter =
  | { field: MetadataFieldDefinition; value: string; values?: never }
  | { field: MetadataFieldDefinition; values: string[]; value?: never };

export function taskStatusFilterOptions(statuses: Array<{ id: string; name: string }>) {
  const options = new Map<string, { value: string; label: string; values: string[] }>();
  for (const status of statuses) {
    const key = status.name.trim().toLowerCase();
    const option = options.get(key);
    if (option) option.values.push(status.id);
    else options.set(key, { value: key, label: status.name.trim(), values: [status.id] });
  }
  return [...options.values()];
}

export type TaskFilters = {
  projectId?: string;
  projectIds?: string[];
  workflowStatusId?: string;
  workflowStatusIds?: string[];
  priority?: TaskPriority;
  priorities?: TaskPriority[];
  milestoneId?: string;
  milestoneIds?: string[];
  assigneeId?: string;
  assigneeIds?: string[];
  reporterMemberId?: string;
  reporterMemberIds?: string[];
  mine?: boolean;
  currentMemberId?: string;
  labelId?: string;
  labelIds?: string[];
  flagged?: boolean;
  parent?: "has" | "none";
  blocked?: "has" | "none";
  requiredDiscipline?: string;
  requiredDisciplines?: string[];
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

function metadataFilter(filter: TaskMetadataFilter): Prisma.TaskWhereInput | null {
  const { field } = filter;
  const values = filter.values ?? (filter.value !== undefined ? [filter.value] : []);
  if (field.type === "boolean") {
    const value = values[0];
    if (value !== "true" && value !== "false") return null;
    return { metadata: { path: [field.key], equals: value === "true" } };
  }
  if (field.type === "number") {
    const value = values[0];
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return { metadata: { path: [field.key], equals: parsed } };
  }
  if (field.type === "multi-select") {
    const validValues = values.filter((value) => field.options?.includes(value));
    if (!validValues.length) return null;
    const conditions = validValues.map((value) => ({ metadata: { path: [field.key], array_contains: [value] } }));
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }
  if (field.type === "select") {
    const validValues = values.filter((value) => field.options?.includes(value));
    if (!validValues.length) return null;
    const conditions = validValues.map((value) => ({ metadata: { path: [field.key], equals: value } }));
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }
  const value = values[0];
  if (!value.trim()) return null;
  return { metadata: { path: [field.key], equals: value } };
}

export function taskFilterWhere(organizationId: string, filters: TaskFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { organizationId };
  const conditions: Prisma.TaskWhereInput[] = [];
  if (filters.projectIds?.length) where.projectId = { in: filters.projectIds };
  else if (filters.projectId) where.projectId = filters.projectId;
  if (filters.workflowStatusIds?.length) where.workflowStatusId = { in: filters.workflowStatusIds };
  else if (filters.workflowStatusId) where.workflowStatusId = filters.workflowStatusId;
  if (filters.priorities?.length) where.priority = { in: filters.priorities };
  else if (filters.priority) where.priority = filters.priority;
  if (filters.milestoneIds?.length) where.milestoneId = { in: filters.milestoneIds };
  else if (filters.milestoneId) where.milestoneId = filters.milestoneId;
  if (filters.assigneeIds?.length) where.assignments = { some: { organizationId, memberId: { in: filters.assigneeIds } } };
  else if (filters.assigneeId) where.assignments = { some: { organizationId, memberId: filters.assigneeId } };
  if (filters.reporterMemberIds?.length) where.reporterMemberId = { in: filters.reporterMemberIds };
  else if (filters.reporterMemberId) where.reporterMemberId = filters.reporterMemberId;
  if (filters.mine && filters.currentMemberId) conditions.push({ assignments: { some: { organizationId, memberId: filters.currentMemberId } } });
  if (filters.labelIds?.length) where.labels = { some: { organizationId, labelId: { in: filters.labelIds } } };
  else if (filters.labelId) where.labels = { some: { organizationId, labelId: filters.labelId } };
  if (filters.flagged !== undefined) where.flaggedAt = filters.flagged ? { not: null } : null;
  if (filters.parent) where.parentTaskId = filters.parent === "has" ? { not: null } : null;
  if (filters.blocked) where.blockedByTaskId = filters.blocked === "has" ? { not: null } : null;
  if (filters.requiredDisciplines?.length) where.requiredDiscipline = { in: filters.requiredDisciplines, mode: "insensitive" };
  else if (filters.requiredDiscipline) where.requiredDiscipline = { equals: filters.requiredDiscipline, mode: "insensitive" };
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
    const condition = metadataFilter(item);
    if (condition) conditions.push(condition);
  }
  if (conditions.length) where.AND = conditions;
  return where;
}
