import { DeploymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export function isDeploymentActiveOnDate(
  deployment: { status: DeploymentStatus; startDate: Date; endDate: Date },
  date: Date,
) {
  if (deployment.status !== DeploymentStatus.ACTIVE && deployment.status !== DeploymentStatus.UPCOMING) return false;
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const start = Date.UTC(deployment.startDate.getUTCFullYear(), deployment.startDate.getUTCMonth(), deployment.startDate.getUTCDate());
  const end = Date.UTC(deployment.endDate.getUTCFullYear(), deployment.endDate.getUTCMonth(), deployment.endDate.getUTCDate());
  return start <= day && day <= end;
}

export function tagConflictsByMember<T extends Record<string, unknown>>(
  conflictsByMember: Array<{ memberId: string; conflicts: T[] }>,
) {
  return conflictsByMember.flatMap(({ memberId, conflicts }) =>
    conflicts.map((conflict) => ({ ...conflict, memberId })),
  );
}

export async function getDeploymentConflicts({
  organizationId,
  memberId,
  startDate,
  endDate,
  status,
  client = db,
}: {
  organizationId: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  status: DeploymentStatus;
  client?: Prisma.TransactionClient | typeof db;
}) {
  if (status !== DeploymentStatus.ACTIVE && status !== DeploymentStatus.UPCOMING) return [];

  const earliestWeek = new Date(startDate);
  earliestWeek.setUTCDate(earliestWeek.getUTCDate() - 6);
  const allocations = await client.resourceAllocation.findMany({
    where: {
      organizationId,
      memberId,
      weekStartDate: { gte: earliestWeek, lte: endDate },
    },
    select: {
      id: true,
      projectId: true,
      weekStartDate: true,
      plannedHrs: true,
      allocationPct: true,
      mode: true,
      project: { select: { code: true, title: true } },
    },
    orderBy: { weekStartDate: "asc" },
  });

  return allocations
    .map((allocation) => {
      const weekEndDate = new Date(allocation.weekStartDate);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
      return {
        allocation,
        weekEndDate,
        overlaps: allocation.weekStartDate <= endDate && weekEndDate >= startDate,
      };
    })
    .filter(({ overlaps }) => overlaps)
    .map(({ allocation, weekEndDate }) => ({
      allocationId: allocation.id,
      projectId: allocation.projectId,
      projectCode: allocation.project.code,
      projectTitle: allocation.project.title,
      weekStartDate: allocation.weekStartDate.toISOString().slice(0, 10),
      weekEndDate: weekEndDate.toISOString().slice(0, 10),
      deploymentStartDate: startDate.toISOString().slice(0, 10),
      deploymentEndDate: endDate.toISOString().slice(0, 10),
      plannedHrs: allocation.plannedHrs,
      allocationPct: allocation.allocationPct,
      mode: allocation.mode,
    }));
}
