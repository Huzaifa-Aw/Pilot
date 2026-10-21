import assert from "node:assert/strict";
import test from "node:test";
import { assetFilterWhere } from "./asset-filters";

test("asset filters combine availability, assigned member, project, location, and search", () => {
  const where = assetFilterWhere("organization-1", {
    category: "Equipment",
    status: "AVAILABLE",
    memberId: "member-1",
    projectId: "project-1",
    location: "North office",
    search: "unit",
  });

  assert.equal(where.organizationId, "organization-1");
  assert.deepEqual(where.category, { equals: "Equipment", mode: "insensitive" });
  assert.equal(where.status, "ACTIVE");
  assert.deepEqual(where.AND, [
    { OR: [
      { projects: { some: { projectId: "project-1", organizationId: "organization-1" } } },
      { checkouts: { some: { organizationId: "organization-1", projectId: "project-1" } } },
    ] },
    { OR: [
      { title: { contains: "unit", mode: "insensitive" } },
      { assetCode: { contains: "unit", mode: "insensitive" } },
      { serialNumber: { contains: "unit", mode: "insensitive" } },
      { location: { contains: "unit", mode: "insensitive" } },
    ] },
    { checkouts: { none: { organizationId: "organization-1", returnedAt: null } } },
    { checkouts: { some: { organizationId: "organization-1", returnedAt: null, memberId: "member-1" } } },
  ]);
  assert.deepEqual(where.location, { equals: "North office", mode: "insensitive" });
});

test("in-use and member filters both require an active same-organization checkout", () => {
  assert.deepEqual(assetFilterWhere("organization-1", { status: "IN_USE", memberId: "member-1" }).AND, [
    { checkouts: { some: { organizationId: "organization-1", returnedAt: null } } },
    { checkouts: { some: { organizationId: "organization-1", returnedAt: null, memberId: "member-1" } } },
  ]);
});
