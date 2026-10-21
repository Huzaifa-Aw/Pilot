import { MemberRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";

function isMemberRole(value: string): value is MemberRole {
  return Object.values(MemberRole).some((role) => role === value);
}

export async function GET(request: NextRequest) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const roleValue = params.get("role");
  let roleFilter: MemberRole | undefined;
  if (roleValue) {
    if (!isMemberRole(roleValue)) {
      return NextResponse.json({ error: "Choose a valid member role.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    roleFilter = roleValue;
  }
  const activeValue = params.get("isActive");
  if (activeValue && activeValue !== "true" && activeValue !== "false") {
    return NextResponse.json({ error: "isActive must be true or false.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const search = params.get("search")?.trim().slice(0, 120);
  const where: Prisma.OrganizationMemberWhereInput = {
    organizationId: context.organizationId,
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(activeValue ? { isActive: activeValue === "true" } : {}),
    ...(search ? {
      OR: [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { discipline: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const members = await db.organizationMember.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { allocations: true, timesheetEntries: true } },
    },
  });
  return NextResponse.json({ data: members });
}
