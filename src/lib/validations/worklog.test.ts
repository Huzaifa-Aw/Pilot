import assert from "node:assert/strict";
import test from "node:test";
import { worklogCreateSchema } from "./worklog";

test("daily worklog requires a project or non-project category and caps each entry at a day", () => {
  assert.equal(worklogCreateSchema.safeParse({ date: "2026-10-21", hours: 1, projectId: "f14ea624-8cb6-4d75-a881-6c9c84aac4c3" }).success, true);
  assert.equal(worklogCreateSchema.safeParse({ date: "2026-10-21", hours: 1, category: "Training" }).success, true);
  assert.equal(worklogCreateSchema.safeParse({ date: "2026-10-21", hours: 1 }).success, false);
  assert.equal(worklogCreateSchema.safeParse({ date: "2026-10-21", hours: 24.25, category: "Training" }).success, false);
});
