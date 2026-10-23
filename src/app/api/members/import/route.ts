import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { getDefaultMetadataFields, prepareMetadataValues } from "@/lib/metadata";
import { metadataCsvHeaders, parseMetadataCsvValues } from "@/lib/metadata-csv";
import { parseCsvTable } from "@/lib/csv";
import { CsvImportError } from "@/lib/csv";
import { memberUpdateSchema } from "@/lib/validations/member";

const fields = ["title", "discipline", "department", "phone", "location", "capacityHrsPerWeek", "dailyCapacityHrs", "timezone"] as const;
type MemberImportRow = { rowNumber: number; memberId: string; email: string; update: Prisma.OrganizationMemberUncheckedUpdateInput; metadata: Prisma.InputJsonObject };

function parseNumeric(row: Record<string, string>, key: string, rowNumber: number, min: number, max: number) {
  const value = row[key];
  if (value === undefined || value === "") return { value: undefined, error: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return { value: undefined, error: `Row ${rowNumber}: ${key} must be between ${min} and ${max}.` };
  return { value: parsed, error: null };
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "member_import", status, error, code,
  });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return fail(400, "Request body must be valid JSON.", "VALIDATION_ERROR");
    throw error;
  }
  if (!body || typeof body !== "object" || !("csv" in body) || typeof body.csv !== "string") {
    return fail(422, "Choose a CSV file to import.", "VALIDATION_ERROR");
  }
  const mode = "mode" in body && body.mode === "commit" ? "commit" : "preview";
  if ("mode" in body && body.mode !== "preview" && body.mode !== "commit") return fail(422, "Choose preview or confirm the import.", "VALIDATION_ERROR");
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "member");
  const customHeaders = metadataCsvHeaders(metadataFields);
  const table = parseCsvTable(body.csv);
  if (table.error) return fail(422, table.error, "VALIDATION_ERROR");
  if (!table.headers.includes("email") || table.headers.some((header) => !["email", ...fields].includes(header as typeof fields[number]) && !customHeaders.has(header))) {
    return fail(422, "Use the downloaded member template headers, including email.", "VALIDATION_ERROR");
  }
  const emails = table.rows.map(({ values }) => values.email.trim().toLowerCase());
  if (emails.some((email) => !email) || new Set(emails).size !== emails.length) {
    return fail(422, "Every row needs a unique email address.", "VALIDATION_ERROR");
  }
  const members = await db.organizationMember.findMany({
    where: { organizationId: context.organizationId, user: { email: { in: emails } } },
    include: { user: { select: { email: true } } },
  });
  const memberByEmail = new Map(members.map((member) => [member.user.email.toLowerCase(), member]));
  const rows: MemberImportRow[] = [];
  for (const row of table.rows) {
    const email = row.values.email.trim().toLowerCase();
    const member = memberByEmail.get(email);
    if (!member) return fail(422, `Row ${row.rowNumber}: no existing organization member matches ${email}. Use the invitation flow to add new people.`, "NOT_FOUND");
    const update: Record<string, unknown> = {};
    for (const field of fields) {
      const value = row.values[field];
      if (value === undefined || value === "") continue;
      if (field === "capacityHrsPerWeek" || field === "dailyCapacityHrs") {
        const parsed = parseNumeric(row.values, field, row.rowNumber, field === "dailyCapacityHrs" ? 0.25 : 0, field === "dailyCapacityHrs" ? 24 : 168);
        if (parsed.error) return fail(422, parsed.error, "VALIDATION_ERROR");
        update[field] = parsed.value;
      } else {
        update[field] = value.trim();
      }
    }
    const validatedUpdate = memberUpdateSchema.safeParse(update);
    if (!validatedUpdate.success) return fail(422, `Row ${row.rowNumber} is invalid: ${validatedUpdate.error.issues[0]?.message ?? "Check member details."}`, "VALIDATION_ERROR");
    const custom = parseMetadataCsvValues(metadataFields, row.values, customHeaders);
    if (custom.error) return fail(422, `Row ${row.rowNumber}: ${custom.error}`, "VALIDATION_ERROR");
    const metadata = await prepareMetadataValues(context.organizationId, "member", custom.values, member.metadata ?? undefined);
    if (!metadata.values) return fail(422, `Row ${row.rowNumber}: ${metadata.error ?? "Custom fields are invalid."}`, "VALIDATION_ERROR");
    const profileUpdate: Prisma.OrganizationMemberUncheckedUpdateInput = {
      title: validatedUpdate.data.title,
      discipline: validatedUpdate.data.discipline,
      department: validatedUpdate.data.department,
      phone: validatedUpdate.data.phone,
      location: validatedUpdate.data.location,
      capacityHrsPerWeek: validatedUpdate.data.capacityHrsPerWeek,
      dailyCapacityHrs: validatedUpdate.data.dailyCapacityHrs,
      timezone: validatedUpdate.data.timezone,
    };
    rows.push({ rowNumber: row.rowNumber, memberId: member.id, email, update: profileUpdate, metadata: metadata.values });
  }
  if (mode === "preview") {
    return NextResponse.json({ data: { rows: rows.map((row) => ({ rowNumber: row.rowNumber, action: "UPDATE", summary: `Update existing member ${row.email}.` })), created: 0, updated: rows.length, skipped: 0 } });
  }
  let result;
  try {
  result = await db.$transaction(async (tx) => {
    for (const row of rows) {
      const before = await tx.organizationMember.findFirst({
        where: { id: row.memberId, organizationId: context.organizationId },
        select: { title: true, discipline: true, department: true, location: true, phone: true, capacityHrsPerWeek: true, dailyCapacityHrs: true },
      });
      if (!before) throw new CsvImportError(`Member ${row.email} changed during import. Preview the file again.`, 409, "CONFLICT");
      const after = await tx.organizationMember.update({
        where: { id: row.memberId, organizationId: context.organizationId },
        data: { ...row.update, metadata: row.metadata },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "organization_member",
        entityId: after.id,
        before,
        after: { title: after.title, discipline: after.discipline, department: after.department, location: after.location, phone: after.phone, capacityHrsPerWeek: after.capacityHrsPerWeek, dailyCapacityHrs: after.dailyCapacityHrs },
        userAgent: request.headers.get("user-agent"),
      }, tx);
    }
    return { kind: "complete" as const, created: 0, updated: rows.length, skipped: 0 };
  });
  } catch (error) {
    if (error instanceof CsvImportError) return fail(error.status, error.message, error.code);
    throw error;
  }
  return NextResponse.json({ data: result });
}
