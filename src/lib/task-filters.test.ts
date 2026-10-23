import assert from "node:assert/strict";
import test from "node:test";
import { TaskPriority } from "@prisma/client";
import { taskFilterWhere } from "./task-filters";

test("task filters preserve tenant scope and combine assignee, label, and mine criteria", () => {
  const where = taskFilterWhere("org-1", {
    assigneeId: "member-1",
    currentMemberId: "member-2",
    mine: true,
    workflowStatusId: "status-1",
    labelId: "label-1",
    priority: TaskPriority.HIGH,
  });
  assert.equal(where.organizationId, "org-1");
  assert.equal(where.workflowStatusId, "status-1");
  assert.deepEqual(where.assignments, { some: { organizationId: "org-1", memberId: "member-1" } });
  assert.deepEqual(where.labels, { some: { organizationId: "org-1", labelId: "label-1" } });
  assert.deepEqual(where.AND, [{ assignments: { some: { organizationId: "org-1", memberId: "member-2" } } }]);
});

test("metadata filters use the configured field key and validate select values", () => {
  const where = taskFilterWhere("org-1", {
    metadata: [
      { field: { key: "phase", label: "Phase", type: "select", options: ["Planning", "Delivery"], order: 0 }, value: "Delivery" },
      { field: { key: "invalid", label: "Invalid", type: "select", options: ["One"], order: 1 }, value: "Two" },
    ],
  });
  assert.deepEqual(where.AND, [{ metadata: { path: ["phase"], equals: "Delivery" } }]);
});

test("metadata numeric and boolean fields retain typed values", () => {
  const where = taskFilterWhere("org-1", {
    metadata: [
      { field: { key: "hours", label: "Hours", type: "number", order: 0 }, value: "3.5" },
      { field: { key: "ready", label: "Ready", type: "boolean", order: 1 }, value: "false" },
    ],
  });
  assert.deepEqual(where.AND, [
    { metadata: { path: ["hours"], equals: 3.5 } },
    { metadata: { path: ["ready"], equals: false } },
  ]);
});
