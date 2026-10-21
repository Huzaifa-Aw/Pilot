import assert from "node:assert/strict";
import test from "node:test";
import { validateMetadataAgainstFields } from "./metadata";

const fields = [
  { key: "disciplineCode", label: "Discipline code", type: "select" as const, options: ["A", "B"], required: true, order: 0 },
  { key: "reviewed", label: "Reviewed", type: "boolean" as const, required: false, order: 1 },
  { key: "tags", label: "Tags", type: "multi-select" as const, options: ["One", "Two"], required: false, order: 2 },
];

test("metadata validation enforces required keys, options, and JSON types", () => {
  assert.match(validateMetadataAgainstFields(fields, {} ) ?? "", /required custom field/);
  assert.match(validateMetadataAgainstFields(fields, { disciplineCode: "Other" }) ?? "", /Discipline code/);
  assert.match(validateMetadataAgainstFields(fields, { disciplineCode: "A", reviewed: "yes" }) ?? "", /Reviewed/);
  assert.equal(validateMetadataAgainstFields(fields, { disciplineCode: "B", reviewed: false, tags: ["One"] }), null);
});

test("metadata validation rejects keys not present in the template", () => {
  assert.match(validateMetadataAgainstFields(fields, { disciplineCode: "A", extra: "value" }) ?? "", /not configured/);
});

test("metadata template changes preserve existing unconfigured values", () => {
  assert.equal(
    validateMetadataAgainstFields(
      fields,
      { disciplineCode: "A", legacyDetail: "preserved" },
      new Set(["legacyDetail"]),
    ),
    null,
  );
});
