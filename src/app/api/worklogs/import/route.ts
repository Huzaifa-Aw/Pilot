import { AuditAction, Prisma, TimesheetPeriodStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { parseCsvTable } from "@/lib/csv";

type WorklogImportRow = {
  rowNumber: number;
  externalKey: string;
  memberId: string;
  memberEmail: string;
  date: Date;
  hours: number;
  projectId: string | null;
  projectCode: string;
  taskId: string | null;
  taskNumber: number | null;
  description?: string | null;
  category?: string | null;
  existingId?: string;
};

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "worklog_import", status, error, code,
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
  if ("mode" in body && body.mode !== "preview" && body.mode !== "commit") {
    return fail(422, "Choose preview or confirm the import.", "VALIDATION_ERROR");
  }
  const table = parseCsvTable(body.csv);
  if (table.error) return fail(422, table.error, "VALIDATION_ERROR");
  const requiredHeaders = ["externalKey", "memberEmail", "date", "hours"];
  const allowedHeaders = new Set([...requiredHeaders, "projectCode", "taskNumber", "description", "category"]);
  if (requiredHeaders.some((header) => !table.headers.includes(header)) || table.headers.some((header) => !allowedHeaders.has(header))) {
    return fail(422, "Use the worklog template headers: externalKey, memberEmail, date, hours, projectCode, taskNumber, description, category.", "VALIDATION_ERROR");
  }
  const externalKeys = table.rows.map(({ values }) => values.externalKey.trim());
  if (externalKeys.some((key) => !key || key.length > 128) || new Set(externalKeys).size !== externalKeys.length) {
    return fail(422, "Every row needs a unique external key.", "VALIDATION_ERROR");
  }
  const emails = [...new Set(table.rows.map(({ values }) => values.memberEmail.trim().toLowerCase()))];
  const codes = [...new Set(table.rows.flatMap(({ values }) => values.projectCode ? [values.projectCode.trim().toUpperCase()] : []))];
  const [members, projects] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: context.organizationId, user: { email: { in: emails } } },
      select: { id: true, user: { select: { email: true } } },
    }),
    db.project.findMany({ where: { organizationId: context.organizationId, code: { in: codes } }, select: { id: true, code: true } }),
  ]);
  const memberByEmail = new Map(members.map((member) => [member.user.email.toLowerCase(), member]));
  const projectByCode = new Map(projects.map((project) => [project.code.toUpperCase(), project]));
  const taskKeys = table.rows.flatMap(({ values }) => values.projectCode && values.taskNumber
    ? [`${values.projectCode.trim().toUpperCase()}:${values.taskNumber.trim()}`]
    : []);
  const taskNumbers = taskKeys.map((key) => Number(key.split(":")[1])).filter(Number.isSafeInteger);
  if (table.rows.some(({ values }) => values.taskNumber && (!Number.isSafeInteger(Number(values.taskNumber)) || Number(values.taskNumber) < 1))) {
    return fail(422, "Task numbers must be positive whole numbers.", "VALIDATION_ERROR");
  }
  const tasks = taskNumbers.length
    ? await db.task.findMany({
        where: { organizationId: context.organizationId, taskNumber: { in: taskNumbers } },
        select: { id: true, taskNumber: true, projectId: true },
      })
    : [];
  const parsedRows: WorklogImportRow[] = [];
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  for (const row of table.rows) {
    const values = row.values;
    const memberEmail = values.memberEmail.trim().toLowerCase();
    const member = memberByEmail.get(memberEmail);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(values.date) ? new Date(`${values.date}T00:00:00.000Z`) : new Date(Number.NaN);
    const hours = Number(values.hours);
    const projectCode = values.projectCode?.trim().toUpperCase() ?? "";
    const project = projectCode ? projectByCode.get(projectCode) : null;
    const taskNumber = values.taskNumber ? Number(values.taskNumber) : null;
    const task = taskNumber && project
      ? tasks.find((candidate) => candidate.projectId === project.id && candidate.taskNumber === taskNumber)
      : null;
    if (!member) return fail(422, `Row ${row.rowNumber}: choose a member in this organization.`, "NOT_FOUND");
    if (!roleAtLeast(context.role, "ADMIN") && member.id !== context.memberId) {
      return fail(403, `Row ${row.rowNumber}: you can import only your own time records.`, "FORBIDDEN");
    }
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values.date || date > today) {
      return fail(422, `Row ${row.rowNumber}: choose a valid date that is not in the future.`, "VALIDATION_ERROR");
    }
    if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) {
      return fail(422, `Row ${row.rowNumber}: hours must be between 0.25 and 24.`, "VALIDATION_ERROR");
    }
    if (projectCode && !project) return fail(422, `Row ${row.rowNumber}: project code is not in this organization.`, "NOT_FOUND");
    if (values.taskNumber && !task) return fail(422, `Row ${row.rowNumber}: task number does not belong to the selected project.`, "NOT_FOUND");
    if (!project && !values.category?.trim()) return fail(422, `Row ${row.rowNumber}: choose a project or enter a time category.`, "VALIDATION_ERROR");
    if (member.id === context.memberId && !(await can(context, "timesheet.log"))) {
      return fail(403, "Your role cannot log time.", "FORBIDDEN");
    }
    if (project && !(await can(context, "project.read", { projectId: project.id }))) {
      return fail(403, `Row ${row.rowNumber}: you cannot log time to this project.`, "FORBIDDEN");
    }
    parsedRows.push({
      rowNumber: row.rowNumber,
      externalKey: values.externalKey.trim(),
      memberId: member.id,
      memberEmail,
      date,
      hours,
      projectId: project?.id ?? null,
      projectCode,
      taskId: task?.id ?? null,
      taskNumber,
      ...(values.description !== undefined && values.description !== "" ? { description: values.description === "-" ? null : values.description.trim() } : {}),
      ...(values.category !== undefined && values.category !== "" ? { category: values.category === "-" ? null : values.category.trim() } : {}),
    });
  }
  const priorWorklogs = await db.worklog.findMany({
    where: { organizationId: context.organizationId, importKey: { in: parsedRows.map(({ externalKey }) => externalKey) } },
    select: { id: true, importKey: true, memberId: true, date: true },
  });
  const priorByKey = new Map(priorWorklogs.map((item) => [item.importKey!, item]));
  for (const row of parsedRows) {
    const prior = priorByKey.get(row.externalKey);
    if (prior && (prior.memberId !== row.memberId || prior.date.getTime() !== row.date.getTime())) {
      return fail(409, `Row ${row.rowNumber}: an externalKey can update hours or details but cannot change its member or date.`, "CONFLICT");
    }
  }
  const rows = parsedRows.map((row) => ({ ...row, existingId: priorByKey.get(row.externalKey)?.id }));
  const membersToCheck = [...new Set(rows.map(({ memberId }) => memberId))];
  const months = [...new Set(rows.map(({ date }) => monthStart(date).toISOString()))].map((value) => new Date(value));
  const lockedPeriods = await db.timesheetPeriod.findMany({
    where: { organizationId: context.organizationId, memberId: { in: membersToCheck }, monthStart: { in: months }, status: { in: [TimesheetPeriodStatus.SUBMITTED, TimesheetPeriodStatus.APPROVED] } },
    select: { memberId: true, monthStart: true, status: true },
  });
  const lockedSet = new Set(lockedPeriods.map(({ memberId, monthStart: start }) => `${memberId}:${start.toISOString()}`));
  for (const row of rows) {
    if (lockedSet.has(`${row.memberId}:${monthStart(row.date).toISOString()}`)) {
      return fail(422, `Row ${row.rowNumber}: this timesheet period is submitted or approved.`, "TIMESHEET_LOCKED");
    }
  }
  if (mode === "preview") {
    return NextResponse.json({ data: {
      rows: rows.map((row) => ({ rowNumber: row.rowNumber, action: row.existingId ? "UPDATE" : "CREATE", summary: `${row.memberEmail} · ${row.date.toISOString().slice(0, 10)} · ${row.hours}h` })),
      created: rows.filter(({ existingId }) => !existingId).length,
      updated: rows.filter(({ existingId }) => existingId).length,
      skipped: 0,
    } });
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    for (const row of rows) {
      const period = await tx.timesheetPeriod.findUnique({
        where: { organizationId_memberId_monthStart: { organizationId: context.organizationId, memberId: row.memberId, monthStart: monthStart(row.date) } },
        select: { status: true },
      });
      if (period && period.status !== TimesheetPeriodStatus.OPEN && period.status !== TimesheetPeriodStatus.REOPENED) {
        return { kind: "locked" as const, rowNumber: row.rowNumber };
      }
    }
    const totals = new Map<string, number>();
    for (const row of rows) {
      const day = row.date.toISOString();
      if (!totals.has(`${row.memberId}:${day}`)) {
        const current = await tx.worklog.aggregate({ where: { organizationId: context.organizationId, memberId: row.memberId, date: row.date }, _sum: { hours: true } });
        totals.set(`${row.memberId}:${day}`, current._sum.hours ?? 0);
      }
      const existing = row.existingId
        ? await tx.worklog.findFirst({ where: { id: row.existingId, organizationId: context.organizationId }, select: { hours: true } })
        : null;
      const key = `${row.memberId}:${day}`;
      const next = (totals.get(key) ?? 0) - (existing?.hours ?? 0) + row.hours;
      if (next > 24) return { kind: "daily-limit" as const, rowNumber: row.rowNumber, day: row.date };
      totals.set(key, next);
    }

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const start = monthStart(row.date);
      const period = await tx.timesheetPeriod.findUnique({
        where: { organizationId_memberId_monthStart: { organizationId: context.organizationId, memberId: row.memberId, monthStart: start } },
      });
      if (!period) await tx.timesheetPeriod.create({ data: { organizationId: context.organizationId, memberId: row.memberId, monthStart: start } });
      const before = row.existingId
        ? await tx.worklog.findFirst({ where: { id: row.existingId, organizationId: context.organizationId } })
        : null;
      const worklog = await tx.worklog.upsert({
        where: { organizationId_importKey: { organizationId: context.organizationId, importKey: row.externalKey } },
        create: {
          importKey: row.externalKey,
          organizationId: context.organizationId,
          memberId: row.memberId,
          projectId: row.projectId,
          taskId: row.taskId,
          date: row.date,
          hours: row.hours,
          description: row.description ?? null,
          category: row.category ?? null,
        },
        update: {
          memberId: row.memberId,
          projectId: row.projectId,
          taskId: row.taskId,
          date: row.date,
          hours: row.hours,
          ...(row.description !== undefined ? { description: row.description } : {}),
          ...(row.category !== undefined ? { category: row.category } : {}),
        },
      });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: before ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: "worklog",
        entityId: worklog.id,
        before: before ? { date: before.date.toISOString().slice(0, 10), hours: before.hours, description: before.description } : null,
        after: { date: worklog.date.toISOString().slice(0, 10), hours: worklog.hours, description: worklog.description },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      if (before) updated += 1;
      else created += 1;
    }
    return { kind: "complete" as const, created, updated, skipped: 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    throw error;
  }
  if (result.kind === "daily-limit") return fail(422, `Row ${result.rowNumber}: daily logged time exceeds 24 hours on ${result.day.toISOString().slice(0, 10)}.`, "DAILY_LIMIT");
  if (result.kind === "locked") return fail(422, `Row ${result.rowNumber}: submitted or approved time cannot be imported.`, "TIMESHEET_LOCKED");
  return NextResponse.json({ data: result });
}
