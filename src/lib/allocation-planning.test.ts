import assert from "node:assert/strict";
import test from "node:test";
import { allocationWeeksForRange, percentageFromPlannedHours, plannedHoursFromPercentage } from "./allocation-planning";

test("allocation date range includes each touched Monday exactly once", () => {
  const weeks = allocationWeeksForRange(new Date("2026-10-21T00:00:00.000Z"), new Date("2026-11-02T00:00:00.000Z"));
  assert.deepEqual(weeks.map((week) => week.toISOString().slice(0, 10)), ["2026-10-19", "2026-10-26", "2026-11-02"]);
});

test("allocation hours and percentages use consistent two-decimal rounding", () => {
  assert.equal(plannedHoursFromPercentage(33.33, 40), 13.33);
  assert.equal(percentageFromPlannedHours(13.33, 40), 33.33);
  assert.equal(percentageFromPlannedHours(5, 0), 0);
});
