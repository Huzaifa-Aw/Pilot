import type { Prisma } from "@prisma/client";

export type AssetAvailability = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED" | "INACTIVE";

export type AssetFilters = {
  search?: string;
  category?: string;
  status?: AssetAvailability;
  memberId?: string;
  projectId?: string;
  location?: string;
};

export function assetFilterWhere(organizationId: string, filters: AssetFilters): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = { organizationId };
  const conditions: Prisma.AssetWhereInput[] = [];
  if (filters.category) where.category = { equals: filters.category, mode: "insensitive" };
  if (filters.location) where.location = { equals: filters.location, mode: "insensitive" };
  if (filters.status === "AVAILABLE") where.status = "ACTIVE";
  if (filters.status === "MAINTENANCE" || filters.status === "RETIRED" || filters.status === "INACTIVE") {
    where.status = filters.status;
  }
  if (filters.projectId) {
    conditions.push({
      OR: [
        { projects: { some: { projectId: filters.projectId, organizationId } } },
        { checkouts: { some: { organizationId, projectId: filters.projectId } } },
      ],
    });
  }
  if (filters.search) {
    conditions.push({ OR: [
      { title: { contains: filters.search, mode: "insensitive" } },
      { assetCode: { contains: filters.search, mode: "insensitive" } },
      { serialNumber: { contains: filters.search, mode: "insensitive" } },
      { location: { contains: filters.search, mode: "insensitive" } },
    ] });
  }

  const checkoutConditions: Prisma.AssetWhereInput[] = [];
  if (filters.status === "AVAILABLE") {
    checkoutConditions.push({
      checkouts: { none: { organizationId, returnedAt: null } },
    });
  }
  if (filters.status === "IN_USE") {
    checkoutConditions.push({
      checkouts: { some: { organizationId, returnedAt: null } },
    });
  }
  if (filters.memberId) {
    checkoutConditions.push({
      checkouts: { some: { organizationId, returnedAt: null, memberId: filters.memberId } },
    });
  }
  where.AND = [...conditions, ...checkoutConditions];
  return where;
}
