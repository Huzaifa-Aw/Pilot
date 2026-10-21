import {
  AuditAction,
  Prisma,
} from "@prisma/client";
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
};

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
    },
  });
}
