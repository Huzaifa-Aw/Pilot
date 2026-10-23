import assert from "node:assert/strict";
import test from "node:test";
import { milestoneProgressPercent } from "./milestone-progress";

test("milestone progress is derived from completed linked tasks", () => {
  assert.equal(milestoneProgressPercent(0, 0), 0);
  assert.equal(milestoneProgressPercent(0, 4), 0);
  assert.equal(milestoneProgressPercent(2, 3), 67);
  assert.equal(milestoneProgressPercent(3, 3), 100);
});

test("milestone progress stays within task completion bounds", () => {
  assert.equal(milestoneProgressPercent(-1, 4), 0);
  assert.equal(milestoneProgressPercent(5, 4), 100);
});
