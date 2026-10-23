import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvTable, serializeCsvRow } from "./csv";

test("CSV table parsing supports quoted commas, escaped quotes, and BOM", () => {
  const result = parseCsvTable('\uFEFFcode,title\nA-1,"Pump, west"\nA-2,"Said ""ready"""');
  assert.equal(result.error, null);
  if (result.error) return;
  assert.deepEqual(result.rows.map(({ values }) => values.title), ["Pump, west", 'Said "ready"']);
});

test("CSV table parser rejects malformed rows, duplicate headers, and unclosed quotes", () => {
  assert.match(parseCsvTable('code,title\nA-1,"open').error ?? "", /unclosed/);
  assert.match(parseCsvTable("code,code\nA-1,A-2").error ?? "", /unique/);
  assert.match(parseCsvTable("code,title\nA-1").error ?? "", /Row 2/);
});

test("CSV template serialization quotes labels with commas and quotes", () => {
  const row = serializeCsvRow(["Custom field: Region, district", 'Custom field: "review"']);
  const parsed = parseCsvTable(`${row}\nNorth,Approved`);
  assert.equal(parsed.error, null);
  if (parsed.error) return;
  assert.equal(parsed.headers[0], "Custom field: Region, district");
  assert.equal(parsed.headers[1], 'Custom field: "review"');
});
