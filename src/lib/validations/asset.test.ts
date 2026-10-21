import assert from "node:assert/strict";
import test from "node:test";
import { assetCheckoutSchema, assetCreateSchema, assetUpdateSchema } from "./asset";

test("asset dates accept browser values and blank fields clear dates", () => {
  const asset = assetCreateSchema.parse({
    assetCode: "TOOL-01",
    title: "Survey tool",
    acquiredOn: "2026-10-21",
    nextServiceDate: "",
  });
  assert.equal(asset.acquiredOn?.toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(asset.nextServiceDate, null);
  assert.equal(assetUpdateSchema.parse({}).acquiredOn, undefined);
});

test("asset checkout requires an in-organization member identifier", () => {
  const payload = assetCheckoutSchema.safeParse({ action: "checkout", memberId: "not-an-id" });
  assert.equal(payload.success, false);
  assert.equal(assetCheckoutSchema.parse({
    action: "checkout",
    memberId: "00000000-0000-4000-8000-000000000001",
    projectId: null,
  }).action, "checkout");
  assert.equal(assetCheckoutSchema.parse({ action: "return" }).action, "return");
});
