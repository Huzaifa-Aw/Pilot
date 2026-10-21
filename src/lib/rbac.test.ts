import assert from "node:assert/strict";
import test from "node:test";
import { MemberRole } from "@prisma/client";
import { roleAtLeast } from "./rbac";

test("roleAtLeast follows the configured hierarchy", () => {
  assert.equal(roleAtLeast(MemberRole.VIEWER, MemberRole.VIEWER), true);
  assert.equal(roleAtLeast(MemberRole.ENGINEER, MemberRole.MANAGER), false);
  assert.equal(roleAtLeast(MemberRole.MANAGER, MemberRole.ENGINEER), true);
  assert.equal(roleAtLeast(MemberRole.OWNER, MemberRole.OWNER), true);
  assert.equal(roleAtLeast(undefined, MemberRole.VIEWER), false);
});
