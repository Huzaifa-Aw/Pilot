import {
  AuditAction,
  AuditFailureCategory,
  AuditOutcome,
  AuditSeverity,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

type AuditWriter = Pick<Prisma.TransactionClient, "auditLog"> | typeof db;

export type AuditEventInput = {
  organizationId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  failureCategory?: AuditFailureCategory | null;
  errorCode?: string | null;
  summary?: string | null;
  correlationId?: string | null;
};

export type AuditFailureInput = {
  organizationId: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  category: AuditFailureCategory;
  errorCode: string;
  summary: string;
  userAgent?: string | null;
  correlationId?: string;
};

export function auditSeverityForFailure(category: AuditFailureCategory) {
  return category === AuditFailureCategory.USER_ERROR ? AuditSeverity.WARNING : AuditSeverity.ERROR;
}

export function createAuditEvent(
  input: AuditEventInput,
  writer: AuditWriter = db,
) {
  return writer.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? Prisma.JsonNull,
      after: input.after ?? Prisma.JsonNull,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      outcome: input.outcome ?? AuditOutcome.SUCCESS,
      severity: input.severity ?? AuditSeverity.INFO,
      failureCategory: input.failureCategory ?? null,
      errorCode: input.errorCode ?? null,
      summary: input.summary ?? null,
      correlationId: input.correlationId ?? null,
    },
  });
}

export async function createAuditFailureEvent(input: AuditFailureInput) {
  const correlationId = input.correlationId ?? randomUUID();
  try {
    await db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        outcome: AuditOutcome.FAILURE,
        severity: auditSeverityForFailure(input.category),
        failureCategory: input.category,
        errorCode: input.errorCode,
        summary: input.summary.slice(0, 500),
        correlationId,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to persist an audit failure event.", { correlationId, error });
  }
  return correlationId;
}
