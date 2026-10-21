import assert from "node:assert/strict";
import test from "node:test";
import { wouldCreateTaskDependencyCycle } from "./task-dependencies";

test("task dependency cycle detection follows dependency chains", () => {
  const dependencies = [
    { id: "task-a", dependencyId: null },
    { id: "task-b", dependencyId: "task-a" },
    { id: "task-c", dependencyId: "task-b" },
  ];
  assert.equal(wouldCreateTaskDependencyCycle("task-a", "task-c", dependencies), true);
  assert.equal(wouldCreateTaskDependencyCycle("task-c", "task-a", dependencies), false);
  assert.equal(wouldCreateTaskDependencyCycle("task-c", "task-c", dependencies), true);
});

test("task dependency cycle detection rejects corrupt loops", () => {
  assert.equal(wouldCreateTaskDependencyCycle("task-c", "task-a", [
    { id: "task-a", dependencyId: "task-b" },
    { id: "task-b", dependencyId: "task-a" },
  ]), true);
});
