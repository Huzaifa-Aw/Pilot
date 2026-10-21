import assert from "node:assert/strict";
import test from "node:test";
import { DeploymentStatus } from "@prisma/client";
import { isDeploymentActiveOnDate, tagConflictsByMember } from "./deployment-conflicts";

test("conflicts remain associated with each assigned member", () => {
  const result = tagConflictsByMember([
    { memberId: "member-a", conflicts: [{ allocationId: "allocation-a" }] },
    { memberId: "member-b", conflicts: [{ allocationId: "allocation-b" }, { allocationId: "allocation-c" }] },
  ]);

  assert.deepEqual(result, [
    { allocationId: "allocation-a", memberId: "member-a" },
    { allocationId: "allocation-b", memberId: "member-b" },
    { allocationId: "allocation-c", memberId: "member-b" },
  ]);
});

test("deployment presence follows the active date range, including upcoming work on its start date", () => {
  const startDate = new Date("2026-10-20T00:00:00.000Z");
  const endDate = new Date("2026-10-22T00:00:00.000Z");
  const date = new Date("2026-10-22T18:30:00.000Z");

  assert.equal(isDeploymentActiveOnDate({ status: DeploymentStatus.ACTIVE, startDate, endDate }, date), true);
  assert.equal(isDeploymentActiveOnDate({ status: DeploymentStatus.UPCOMING, startDate, endDate }, date), true);
  assert.equal(isDeploymentActiveOnDate({ status: DeploymentStatus.ACTIVE, startDate, endDate }, new Date("2026-10-23T00:00:00Z")), false);
});
