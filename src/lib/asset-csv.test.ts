import assert from "node:assert/strict";
import test from "node:test";
import { parseAssetCsv } from "./asset-csv";

test("asset CSV supports quoted commas and doubled quotes", () => {
  const result = parseAssetCsv('assetCode,title,category,description\nA-1,"Pump, west","Equipment","Said ""ready"""\n');
  assert.equal(result.error, null);
  if (result.error) return;
  assert.equal(result.assets[0].title, "Pump, west");
  assert.equal(result.assets[0].description, 'Said "ready"');
});

test("asset CSV rejects unclosed quotes, duplicate codes, and invalid rows", () => {
  assert.match(parseAssetCsv('assetCode,title\nA-1,"open').error ?? "", /unclosed/);
  assert.match(parseAssetCsv("assetCode,title\nA-1,One\nA-1,Two").error ?? "", /unique/);
  assert.match(parseAssetCsv("assetCode,title\n,Missing code").error ?? "", /Row 2/);
});
