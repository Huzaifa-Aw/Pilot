import { MemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/lib/tenant";
import { roleAtLeast } from "@/lib/rbac";
import { can, type Capability, type PermissionResource } from "@/lib/permissions";

export async function requireCapability(
  capability: Capability,
  resource: PermissionResource = {},
) {
  const context = await resolveTenantContext();
  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        { error: "Sign in with an active organization to continue.", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }
  if (!(await can(context, capability, resource))) {
    return {
      context: null,
      response: NextResponse.json(
        { error: "Your organization role or project access does not allow this action.", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }
  return { context, response: null };
}

export async function requireTenantRole(minimumRole: MemberRole) {
  const context = await resolveTenantContext();
  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        { error: "Sign in with an active organization to continue.", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }
  if (!roleAtLeast(context.role, minimumRole)) {
    return {
      context: null,
      response: NextResponse.json(
        { error: "Your organization role does not allow this action.", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }
  return { context, response: null };
}

export function failureResponse(
  status: number,
  error: string,
  code: string,
) {
  return NextResponse.json(
    { error, code },
    { status },
  );
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}

export function isTransactionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}
