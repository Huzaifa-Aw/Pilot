import assert from "node:assert/strict";
import test from "node:test";
import { setupSchema } from "./setup";

const validSetup = {
  organizationName: "Northwind Workspace",
  organizationSlug: "northwind-workspace",
  ownerName: "Jordan Lee",
  ownerEmail: "JORDAN@example.com",
  password: "A-long-safe-password-123",
};

test("setup normalizes the owner email", () => {
  const parsed = setupSchema.parse(validSetup);
  assert.equal(parsed.ownerEmail, "jordan@example.com");
});

test("setup rejects weak passwords and invalid slugs", () => {
  assert.equal(setupSchema.safeParse({ ...validSetup, password: "short" }).success, false);
  assert.equal(setupSchema.safeParse({ ...validSetup, organizationSlug: "Bad slug" }).success, false);
});
