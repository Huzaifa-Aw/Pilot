import assert from "node:assert/strict";
import test from "node:test";
import { AuditFailureCategory, AuditSeverity } from "@prisma/client";
import { auditSeverityForFailure } from "./audit";

test("audit severity distinguishes user input failures from application failures", () => {
  assert.equal(auditSeverityForFailure(AuditFailureCategory.USER_ERROR), AuditSeverity.WARNING);
  assert.equal(auditSeverityForFailure(AuditFailureCategory.APPLICATION_ERROR), AuditSeverity.ERROR);
});
