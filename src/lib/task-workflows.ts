import { TaskStatus, type Prisma } from "@prisma/client";

export const DEFAULT_WORKFLOW_STATUSES = [
  { key: "BACKLOG", name: "Backlog", category: TaskStatus.BACKLOG },
  { key: "IN_PROGRESS", name: "In progress", category: TaskStatus.IN_PROGRESS },
  { key: "UNDER_REVIEW", name: "Under review", category: TaskStatus.UNDER_REVIEW },
  { key: "APPROVED", name: "Approved", category: TaskStatus.APPROVED },
  { key: "COMPLETED", name: "Completed", category: TaskStatus.COMPLETED },
  { key: "CANCELLED", name: "Cancelled", category: TaskStatus.CANCELLED },
] as const;

const taskFieldLabels: Record<string, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  assigneeIds: "Assigned members",
  startDate: "Start date",
  dueDate: "Due date",
  createdAt: "Created date",
  updatedAt: "Updated date",
  completedAt: "Completion date",
  estimatedHrs: "Estimated hours",
  actualHrs: "Actual hours",
  milestoneId: "Milestone",
  requiredDiscipline: "Required discipline",
  labelIds: "Labels",
};

export function requiredTaskFieldLabels(keys: string[], customFields: Array<{ key: string; label: string }>) {
  const customLabels = new Map(customFields.map(({ key, label }) => [key, label]));
  return keys.map((key) =>
    taskFieldLabels[key] ?? customLabels.get(key) ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " "),
  );
}

export function missingRequiredTaskFields(
  requiredFieldKeys: string[],
  values: Record<string, unknown>,
) {
  return requiredFieldKeys.filter((key) => {
    const value = values[key];
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  });
}

export function isWorkflowTransitionAllowed(
  fromStatusId: string,
  toStatusId: string,
  transitions: Array<{ fromStatusId: string; toStatusId: string }>,
) {
  return fromStatusId === toStatusId || transitions.some((transition) =>
    transition.fromStatusId === fromStatusId && transition.toStatusId === toStatusId,
  );
}

export async function resolveWorkflowForProject(
  tx: Prisma.TransactionClient,
  organizationId: string,
  workflowId: string | null,
) {
  return tx.taskWorkflow.findFirst({
    where: {
      organizationId,
      ...(workflowId ? { id: workflowId } : { isDefault: true }),
    },
    include: {
      statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function createDefaultTaskWorkflow(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const existing = await tx.taskWorkflow.findFirst({
    where: { organizationId, isDefault: true },
    include: { statuses: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) return existing;

  const workflow = await tx.taskWorkflow.create({
    data: { organizationId, name: "Default workflow", isDefault: true },
  });
  const statuses = await Promise.all(DEFAULT_WORKFLOW_STATUSES.map((status, sortOrder) =>
    tx.taskWorkflowStatus.create({
      data: {
        organizationId,
        workflowId: workflow.id,
        ...status,
        sortOrder,
        isInitial: sortOrder === 0,
      },
    }),
  ));
  await tx.taskWorkflowTransition.createMany({
    data: statuses.flatMap((fromStatus) => statuses
      .filter((toStatus) => toStatus.id !== fromStatus.id)
      .map((toStatus) => ({
        organizationId,
        workflowId: workflow.id,
        fromStatusId: fromStatus.id,
        toStatusId: toStatus.id,
      }))),
  });
  return { ...workflow, statuses };
}
