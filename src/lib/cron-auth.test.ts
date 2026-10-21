import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedCron } from "./cron-auth";

test("cron authorization requires an exact bearer secret", () => {
  assert.equal(isAuthorizedCron("Bearer secret-value", "secret-value"), true);
  assert.equal(isAuthorizedCron("secret-value", "secret-value"), false);
  assert.equal(isAuthorizedCron("Bearer wrong", "secret-value"), false);
  assert.equal(isAuthorizedCron("Bearer secret-value", undefined), false);
});
