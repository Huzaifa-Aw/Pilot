import type { MemberRole } from "@prisma/client";

const roleOrder: readonly MemberRole[] = ["VIEWER", "ENGINEER", "MANAGER", "ADMIN", "OWNER"];

export function roleAtLeast(role: MemberRole | null | undefined, minimum: MemberRole) {
  if (!role) return false;
  const level = roleOrder.indexOf(role);
  const required = roleOrder.indexOf(minimum);
  return level !== -1 && required !== -1 && level >= required;
}
