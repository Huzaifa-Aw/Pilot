import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { parseCsvTable } from "@/lib/csv";

type AllocationCsvRow = {
  rowNumber: number;
  memberEmail: string;
  projectCode: string;
  weekStartDate: Date;
  plannedHrs: number;
  allocationPct: number;
  mode?: string;
  notes?: string;
  memberId?: string;
  projectId?: string;
  existingId?: string;
};

function weekDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1 ? date : null;
}

async function lockWeek(tx: Prisma.TransactionClient, organizationId: string, memberId: string, weekStartDate: Date) {
  await tx.allocationWeekLock.upsert({
    where: { organizationId_memberId_weekStartDate: { organizationId, memberId, weekStartDate } },
    create: { organizationId, memberId, weekStartDate },
    update: { version: { increment: 1 } },
  });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "allocation_import", status, error, code,
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
  const mode = "mode" in body && body.mode === "commit" ? body.mode : "preview";
  if ("mode" in body && body.mode !== "preview" && body.mode !== "commit") return fail(422, "Choose preview or confirm the import.", "VALIDATION_ERROR");
  const table = parseCsvTable(body.csv);
  if (table.error) return fail(422, table.error, "VALIDATION_ERROR");
  const required = ["memberEmail", "projectCode", "weekStartDate", "plannedHrs", "allocationPct"];
  if (required.some((header) => !table.headers.includes(header)) || table.headers.some((header) => ![...required, "mode", "notes"].includes(header))) {
    return fail(422, "Use the allocation template headers: memberEmail, projectCode, weekStartDate, plannedHrs, allocationPct, mode, notes.", "VALIDATION_ERROR");
  }
  const identities: Array<{ memberEmail: string; projectCode: string; weekStartDate: Date; plannedHrs: number; allocationPct: number; mode?: string; notes?: string }> = [];
  for (const { rowNumber, values } of table.rows) {
    const memberEmail = values.memberEmail.trim().toLowerCase();
    const projectCode = values.projectCode.trim().toUpperCase();
    const weekStartDate = weekDate(values.weekStartDate);
    const plannedHrs = Number(values.plannedHrs);
    const allocationPct = Number(values.allocationPct);
    if (!memberEmail || !projectCode || !weekStartDate || !Number.isFinite(plannedHrs) || plannedHrs < 0 || plannedHrs > 168 || !Number.isFinite(allocationPct) || allocationPct < 0 || allocationPct > 100) {
      return fail(422, `Row ${rowNumber}: check member email, project code, Monday week start, hours, and allocation percentage.`, "VALIDATION_ERROR");
    }
    if (values.mode && !["Remote", "On-Site", "Hybrid"].includes(values.mode)) {
      return fail(422, `Row ${rowNumber}: choose Remote, On-Site, or Hybrid for work mode.`, "VALIDATION_ERROR");
    }
    identities.push({ memberEmail, projectCode, weekStartDate, plannedHrs, allocationPct, mode: values.mode.trim() || undefined, notes: values.notes.trim() || undefined });
  }

  const rows = identities;
  const keys = rows.map(({ memberEmail, projectCode, weekStartDate }) => `${memberEmail}:${projectCode}:${weekStartDate.toISOString().slice(0, 10)}`);
  if (new Set(keys).size !== keys.length) return fail(409, "The CSV repeats a member, project, and week combination.", "CONFLICT");

  const emails = [...new Set(rows.map(({ memberEmail }) => memberEmail))];
  const codes = [...new Set(rows.map(({ projectCode }) => projectCode))];
  const [members, projects] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: context.organizationId, user: { email: { in: emails } } }, select: { id: true, capacityHrsPerWeek: true, user: { select: { email: true } } } }),
    db.project.findMany({ where: { organizationId: context.organizationId, code: { in: codes } }, select: { id: true, code: true } }),
  ]);
  const memberByEmail = new Map(members.map((member) => [member.user.email.toLowerCase(), member]));
  const projectByCode = new Map(projects.map((project) => [project.code.toUpperCase(), project]));
  const resolved: AllocationCsvRow[] = [];
  for (const [index, row] of rows.entries()) {
    const member = memberByEmail.get(row.memberEmail);
    const project = projectByCode.get(row.projectCode);
    if (!member || !project) return fail(422, `Row ${index + 2}: choose an existing member and project in this organization.`, "VALIDATION_ERROR");
    if (!(await can(context, "allocation.update", { projectId: project.id, memberId: member.id }))) {
      return fail(403, `Row ${index + 2}: you do not have access to change this allocation.`, "FORBIDDEN");
    }
    if (Math.abs(member.capacityHrsPerWeek * row.allocationPct / 100 - row.plannedHrs) > 0.01) {
      return fail(422, `Row ${index + 2}: planned hours do not match the member's weekly capacity.`, "VALIDATION_ERROR");
    }
    resolved.push({ ...row, rowNumber: index + 2, memberId: member.id, projectId: project.id });
  }
  const weeks = [...new Map(resolved.map((row) => [`${row.memberId}:${row.weekStartDate.toISOString()}`, { memberId: row.memberId!, weekStartDate: row.weekStartDate }])).values()];
  const existing = await db.resourceAllocation.findMany({
    where: { organizationId: context.organizationId, OR: weeks.map(({ memberId, weekStartDate }) => ({ memberId, weekStartDate })) },
    select: { id: true, memberId: true, projectId: true, weekStartDate: true, plannedHrs: true, allocationPct: true },
  });
  const existingByKey = new Map(existing.map((item) => [`${item.memberId}:${item.projectId}:${item.weekStartDate.toISOString()}`, item]));
  const previewRows = resolved.map((row) => {
    const prior = existingByKey.get(`${row.memberId}:${row.projectId}:${row.weekStartDate.toISOString()}`);
    return { ...row, existingId: prior?.id, action: prior ? "UPDATE" as const : "CREATE" as const };
  });
  if (mode === "preview") {
    return NextResponse.json({ data: {
      rows: previewRows.map(({ rowNumber, action, memberEmail, projectCode, weekStartDate }) => ({ rowNumber, action, summary: `${memberEmail} · ${projectCode} · week of ${weekStartDate.toISOString().slice(0, 10)}` })),
      created: previewRows.filter(({ action }) => action === "CREATE").length,
      updated: previewRows.filter(({ action }) => action === "UPDATE").length,
      skipped: 0,
    } });
  }

  let result;
  try {
  result = await db.$transaction(async (tx) => {
    const sortedWeeks = [...weeks].sort((a, b) => a.memberId.localeCompare(b.memberId) || a.weekStartDate.getTime() - b.weekStartDate.getTime());
    for (const week of sortedWeeks) await lockWeek(tx, context.organizationId, week.memberId, week.weekStartDate);
    const totals = new Map<string, number>();
    const currentAllocations = await tx.resourceAllocation.findMany({
      where: { organizationId: context.organizationId, OR: sortedWeeks.map(({ memberId, weekStartDate }) => ({ memberId, weekStartDate })) },
      select: { id: true, memberId: true, projectId: true, weekStartDate: true, plannedHrs: true, allocationPct: true, mode: true, notes: true },
    });
    const currentByKey = new Map(currentAllocations.map((item) => [`${item.memberId}:${item.projectId}:${item.weekStartDate.toISOString()}`, item]));
    for (const week of sortedWeeks) {
      const total = currentAllocations.filter((item) => item.memberId === week.memberId && item.weekStartDate.getTime() === week.weekStartDate.getTime()).reduce((sum, item) => sum + item.allocationPct, 0);
      totals.set(`${week.memberId}:${week.weekStartDate.toISOString()}`, total);
    }
    for (const row of previewRows) {
      const weekKey = `${row.memberId}:${row.weekStartDate.toISOString()}`;
      const prior = currentByKey.get(`${row.memberId}:${row.projectId}:${row.weekStartDate.toISOString()}`);
      const nextTotal = (totals.get(weekKey) ?? 0) - (prior?.allocationPct ?? 0) + row.allocationPct;
      if (nextTotal > 100) return { kind: "overallocated" as const, rowNumber: row.rowNumber, week: row.weekStartDate, overBy: nextTotal - 100 };
      totals.set(weekKey, nextTotal);
    }
    let created = 0;
    let updated = 0;
    for (const row of previewRows) {
      const unique = { organizationId_memberId_projectId_weekStartDate: { organizationId: context.organizationId, memberId: row.memberId!, projectId: row.projectId!, weekStartDate: row.weekStartDate } };
      const before = currentByKey.get(`${row.memberId}:${row.projectId}:${row.weekStartDate.toISOString()}`);
      const allocation = await tx.resourceAllocation.upsert({
        where: unique,
        create: {
          organizationId: context.organizationId,
          memberId: row.memberId!,
          projectId: row.projectId!,
          weekStartDate: row.weekStartDate,
          plannedHrs: row.plannedHrs,
          allocationPct: row.allocationPct,
          mode: row.mode ?? "Remote",
          notes: row.notes ?? null,
        },
        update: {
          plannedHrs: row.plannedHrs,
          allocationPct: row.allocationPct,
          ...(row.mode ? { mode: row.mode } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: before ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: "resource_allocation",
        entityId: allocation.id,
        before: before ? { weekStartDate: before.weekStartDate.toISOString().slice(0, 10), plannedHrs: before.plannedHrs, allocationPct: before.allocationPct } : null,
        after: { weekStartDate: allocation.weekStartDate.toISOString().slice(0, 10), plannedHrs: allocation.plannedHrs, allocationPct: allocation.allocationPct },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      if (before) updated += 1;
      else created += 1;
    }
    return { kind: "complete" as const, created, updated, skipped: 0 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "An allocation changed during import. Preview the file again.", "CONFLICT");
    throw error;
  }
  if (result.kind === "overallocated") return fail(422, `Row ${result.rowNumber}: week of ${result.week.toISOString().slice(0, 10)} exceeds 100% capacity by ${result.overBy.toFixed(1)}%.`, "OVERALLOCATION");
  return NextResponse.json({ data: result });
}
