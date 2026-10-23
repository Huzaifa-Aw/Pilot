import assert from "node:assert/strict";
import test from "node:test";
import { clearFiltersHref, removeFilterParamHref, removeFilterParamsHref } from "./filter-params";

test("removing one filter preserves other query state and resets pagination", () => {
  assert.equal(
    removeFilterParamHref("/assets", { search: "kit", category: "Tools", page: "3", sort: "title" }, "category"),
    "/assets?search=kit&sort=title",
  );
});

test("removing a combined date-range chip clears both endpoints", () => {
  assert.equal(
    removeFilterParamsHref("/board", { dueFrom: "2026-01-01", dueTo: "2026-01-31", project: "p1" }, ["dueFrom", "dueTo"]),
    "/board?project=p1",
  );
});

test("clearing filters retains only explicitly preserved state", () => {
  assert.equal(
    clearFiltersHref("/board", { status: "IN_PROGRESS", view: "list", page: "2" }, ["view"]),
    "/board?view=list",
  );
});
