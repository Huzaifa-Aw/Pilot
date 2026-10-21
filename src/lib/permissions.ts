import type { MemberRole } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/role-hierarchy";

export type Capability =
  | "board.read"
  | "project.read"
  | "project.create"
  | "project.update"
  | "project.members.manage"
  | "milestone.create"
  | "milestone.update"
  | "task.create"
  | "task.update"
  | "task.move"
  | "timesheet.log"
  | "timesheet.team"
  | "timesheet.approve"
  | "allocation.read"
  | "allocation.update"
  | "people.read"
  | "profile.update"
  | "profile.manage"
  | "role.manage"
  | "deployment.read"
  | "deployment.update"
  | "asset.read"
  | "asset.update"
  | "settings.manage"
  | "audit.read";

export type PermissionResource = {
  projectId?: string;
  memberId?: string;
  taskAssigneeIds?: string[];
};

export type ReportingMember = { id: string; reportsToMemberId: string | null };

export function isWithinReportingTree(managerId: string, targetId: string, members: ReportingMember[]) {
  if (managerId === targetId) return true;
  const children = new Map<string, string[]>();
  for (const member of members) {
    if (!member.reportsToMemberId) continue;
    const reports = children.get(member.reportsToMemberId) ?? [];
    reports.push(member.id);
    children.set(member.reportsToMemberId, reports);
  }
  const pending = [...(children.get(managerId) ?? [])];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (current === targetId) return true;
    visited.add(current);
    pending.push(...(children.get(current) ?? []));
  }
  return false;
}

export function projectMembershipAllows(role: "LEAD" | "MEMBER", capability: Capability) {
  if (["project.update", "project.members.manage", "milestone.create", "milestone.update"].includes(capability)) {
    return role === "LEAD";
  }
  return true;
}

export { roleAtLeast };

const minimumRole: Record<Capability, MemberRole> = {
  "board.read": "VIEWER",
  "project.read": "VIEWER",
  "project.create": "MANAGER",
  "project.update": "MANAGER",
  "project.members.manage": "MANAGER",
  "milestone.create": "MANAGER",
  "milestone.update": "MANAGER",
  "task.create": "ENGINEER",
  "task.update": "MANAGER",
  "task.move": "ENGINEER",
  "timesheet.log": "ENGINEER",
  "timesheet.team": "MANAGER",
  "timesheet.approve": "MANAGER",
  "allocation.read": "ENGINEER",
  "allocation.update": "MANAGER",
  "people.read": "ENGINEER",
  "profile.update": "VIEWER",
  "profile.manage": "MANAGER",
  "role.manage": "ADMIN",
  "deployment.read": "ENGINEER",
  "deployment.update": "MANAGER",
  "asset.read": "VIEWER",
  "asset.update": "MANAGER",
  "settings.manage": "ADMIN",
  "audit.read": "ADMIN",
};

export function roleHasCapability(role: MemberRole, capability: Capability) {
  return roleAtLeast(role, minimumRole[capability]);
}

async function projectRole(context: TenantContext, projectId: string) {
  const membership = await db.projectMember.findUnique({
    where: { projectId_memberId: { projectId, memberId: context.memberId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

async function reportsTo(context: TenantContext, memberId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: context.organizationId, isActive: true },
    select: { id: true, reportsToMemberId: true },
  });
  return isWithinReportingTree(context.memberId, memberId, members);
}

export async function can(
  context: TenantContext,
  capability: Capability,
  resource: PermissionResource = {},
): Promise<boolean> {
  if (!roleHasCapability(context.role, capability)) return false;

  if (resource.projectId && context.role !== "OWNER" && context.role !== "ADMIN") {
    const membershipRole = await projectRole(context, resource.projectId);
    if (!membershipRole) return false;
    if (!projectMembershipAllows(membershipRole, capability)) return false;
  }

  if (capability === "task.move" && context.role === "ENGINEER") {
    return Boolean(resource.taskAssigneeIds?.includes(context.memberId));
  }
  if (capability === "task.create" && context.role === "ENGINEER") {
    return Boolean(resource.projectId && await projectRole(context, resource.projectId));
  }

  if (["timesheet.team", "timesheet.approve", "allocation.read", "profile.manage"].includes(capability) &&
      resource.memberId &&
      context.role === "MANAGER" &&
      !(await reportsTo(context, resource.memberId))) {
    return false;
  }

  if (capability === "profile.update" && resource.memberId) {
    return context.memberId === resource.memberId || context.role === "ADMIN" || context.role === "OWNER";
  }

  return true;
}

export async function reportTree(context: TenantContext) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: context.organizationId, isActive: true },
    select: { id: true, reportsToMemberId: true },
  });
  const children = new Map<string, string[]>();
  for (const member of members) {
    if (!member.reportsToMemberId) continue;
    const reports = children.get(member.reportsToMemberId) ?? [];
    reports.push(member.id);
    children.set(member.reportsToMemberId, reports);
  }
  const ids = [context.memberId];
  for (let index = 0; index < ids.length; index++) {
    for (const child of children.get(ids[index]) ?? []) {
      if (!ids.includes(child)) ids.push(child);
    }
  }
  return ids;
}
