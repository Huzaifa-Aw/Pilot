import assert from "node:assert/strict";
import test from "node:test";
import { metadataCsvHeaders, parseMetadataCsvValues } from "./metadata-csv";

test("custom CSV columns use readable labels and disambiguate duplicate labels", () => {
  const headers = metadataCsvHeaders([
    { key: "region", label: "Region", type: "text", order: 0 },
    { key: "regionCode", label: "Region", type: "text", order: 1 },
  ]);
  assert.deepEqual([...headers], [["Custom field: Region", "region"], ["Custom field: Region (2)", "regionCode"]]);
});

test("custom CSV values are parsed by the configured field types", () => {
  const fields = [
    { key: "capacity", label: "Capacity", type: "number" as const, order: 0 },
    { key: "ready", label: "Ready", type: "boolean" as const, order: 1 },
    { key: "skills", label: "Skills", type: "multi-select" as const, options: ["Planning", "Delivery"], order: 2 },
  ];
  const headers = metadataCsvHeaders(fields);
  assert.deepEqual(parseMetadataCsvValues(fields, {
    "Custom field: Capacity": "4.5",
    "Custom field: Ready": "Yes",
    "Custom field: Skills": "Planning|Delivery",
  }, headers), {
    error: null,
    values: { capacity: 4.5, ready: true, skills: ["Planning", "Delivery"] },
  });
  assert.match(parseMetadataCsvValues(fields, { "Custom field: Capacity": "many" }, headers).error ?? "", /Capacity/);
});
