import assert from "node:assert/strict";
import test from "node:test";
import { isWorkflowTransitionAllowed, missingRequiredTaskFields } from "./task-workflows";

test("workflow transitions allow configured edges and the current status", () => {
  const transitions = [{ fromStatusId: "open", toStatusId: "doing" }];
  assert.equal(isWorkflowTransitionAllowed("open", "doing", transitions), true);
  assert.equal(isWorkflowTransitionAllowed("open", "open", transitions), true);
  assert.equal(isWorkflowTransitionAllowed("doing", "open", transitions), false);
});

test("required field checks accept false and zero but reject empty values", () => {
  assert.deepEqual(
    missingRequiredTaskFields(["title", "hours", "flag", "labels", "custom"], {
      title: "Review",
      hours: 0,
      flag: false,
      labels: [],
      custom: null,
    }),
    ["labels", "custom"],
  );
});
