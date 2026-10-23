import assert from "node:assert/strict";
import test from "node:test";
import { TaskPriority } from "@prisma/client";
import { taskFilterWhere, taskStatusFilterOptions } from "./task-filters";

test("status filter options group identical workflow status names", () => {
  assert.deepEqual(taskStatusFilterOptions([
    { id: "status-1", name: "In progress" },
    { id: "status-2", name: "In Progress" },
    { id: "status-3", name: "Review" },
  ]), [
    { value: "in progress", label: "In progress", values: ["status-1", "status-2"] },
    { value: "review", label: "Review", values: ["status-3"] },
  ]);
});

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

test("task filters combine multiple selected projects, statuses, assignees, priorities, and labels", () => {
  const where = taskFilterWhere("org-1", {
    projectIds: ["project-1", "project-2"],
    workflowStatusIds: ["status-1", "status-2"],
    assigneeIds: ["member-1", "member-2"],
    priorities: [TaskPriority.HIGH, TaskPriority.MEDIUM],
    labelIds: ["label-1", "label-2"],
  });
  assert.deepEqual(where.projectId, { in: ["project-1", "project-2"] });
  assert.deepEqual(where.workflowStatusId, { in: ["status-1", "status-2"] });
  assert.deepEqual(where.priority, { in: [TaskPriority.HIGH, TaskPriority.MEDIUM] });
  assert.deepEqual(where.assignments, { some: { organizationId: "org-1", memberId: { in: ["member-1", "member-2"] } } });
  assert.deepEqual(where.labels, { some: { organizationId: "org-1", labelId: { in: ["label-1", "label-2"] } } });
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

test("metadata filters match any selected option for multi-select fields", () => {
  const where = taskFilterWhere("org-1", {
    metadata: [{
      field: { key: "teams", label: "Teams", type: "multi-select", options: ["Planning", "Delivery"], order: 0 },
      values: ["Planning", "Delivery"],
    }],
  });
  assert.deepEqual(where.AND, [{
    OR: [
      { metadata: { path: ["teams"], array_contains: ["Planning"] } },
      { metadata: { path: ["teams"], array_contains: ["Delivery"] } },
    ],
  }]);
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
