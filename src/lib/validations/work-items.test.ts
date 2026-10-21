import assert from "node:assert/strict";
import test from "node:test";
import { milestoneUpdateSchema } from "./milestone";
import { projectCreateSchema, projectUpdateSchema } from "./project";
import { taskUpdateSchema } from "./task";

test("partial updates leave omitted schedule fields untouched", () => {
  const project = projectUpdateSchema.parse({ title: "Updated title" });
  const milestone = milestoneUpdateSchema.parse({ status: "IN_PROGRESS" });
  const task = taskUpdateSchema.parse({ status: "IN_PROGRESS" });

  assert.equal(Object.hasOwn(project, "startDate"), false);
  assert.equal(Object.hasOwn(project, "endDate"), false);
  assert.equal(Object.hasOwn(milestone, "targetDate"), false);
  assert.equal(Object.hasOwn(task, "dueDate"), false);
});

test("date input accepts browser dates and Auth API ISO values", () => {
  assert.equal(projectUpdateSchema.parse({ startDate: "2026-10-21" }).startDate?.toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(projectUpdateSchema.parse({ startDate: "2026-10-21T00:00:00.000Z" }).startDate?.toISOString(), "2026-10-21T00:00:00.000Z");
});

test("project form can leave optional dates and budget unset", () => {
  const project = projectCreateSchema.parse({
    code: "PRJ-TEST",
    title: "Test project",
    status: "PLANNING",
    startDate: null,
    endDate: null,
    budgetHours: null,
    tags: [],
  });
  assert.equal(project.startDate, null);
  assert.equal(project.endDate, null);
  assert.equal(project.budgetHours, null);
});
