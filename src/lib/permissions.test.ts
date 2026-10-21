import assert from "node:assert/strict";
import test from "node:test";
import { isWithinReportingTree, projectMembershipAllows, roleHasCapability } from "./permissions";

test("the shared board is visible to every role", () => {
  for (const role of ["VIEWER", "ENGINEER", "MANAGER", "ADMIN", "OWNER"] as const) {
    assert.equal(roleHasCapability(role, "board.read"), true);
  }
});

test("administrative capabilities retain their minimum roles", () => {
  assert.equal(roleHasCapability("MANAGER", "role.manage"), false);
  assert.equal(roleHasCapability("ADMIN", "role.manage"), true);
  assert.equal(roleHasCapability("ADMIN", "settings.manage"), true);
  assert.equal(roleHasCapability("VIEWER", "settings.manage"), false);
});

test("time logging and task moves are available at the agreed minimum roles", () => {
  assert.equal(roleHasCapability("VIEWER", "timesheet.log"), false);
  assert.equal(roleHasCapability("ENGINEER", "timesheet.log"), true);
  assert.equal(roleHasCapability("VIEWER", "task.move"), false);
  assert.equal(roleHasCapability("ENGINEER", "task.move"), true);
});

test("project lead capabilities are narrower than ordinary project membership", () => {
  assert.equal(projectMembershipAllows("MEMBER", "task.move"), true);
  assert.equal(projectMembershipAllows("MEMBER", "project.update"), false);
  assert.equal(projectMembershipAllows("MEMBER", "milestone.update"), false);
  assert.equal(projectMembershipAllows("LEAD", "project.members.manage"), true);
});

test("team permission scope includes direct and indirect reports but not unrelated members", () => {
  const members = [
    { id: "manager", reportsToMemberId: null },
    { id: "lead", reportsToMemberId: "manager" },
    { id: "engineer", reportsToMemberId: "lead" },
    { id: "unrelated", reportsToMemberId: null },
  ];
  assert.equal(isWithinReportingTree("manager", "manager", members), true);
  assert.equal(isWithinReportingTree("manager", "engineer", members), true);
  assert.equal(isWithinReportingTree("manager", "unrelated", members), false);
});

test("report tree traversal terminates when stored reporting links contain a cycle", () => {
  const members = [
    { id: "a", reportsToMemberId: "b" },
    { id: "b", reportsToMemberId: "a" },
    { id: "other", reportsToMemberId: null },
  ];
  assert.equal(isWithinReportingTree("a", "other", members), false);
});
