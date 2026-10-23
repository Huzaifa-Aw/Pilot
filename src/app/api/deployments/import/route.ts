import { AuditAction, DeploymentStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getDefaultMetadataFields, prepareMetadataValues } from "@/lib/metadata";
import { metadataCsvHeaders, parseMetadataCsvValues } from "@/lib/metadata-csv";
import { getDeploymentConflicts, tagConflictsByMember } from "@/lib/deployment-conflicts";
import { CsvImportError, parseCsvTable } from "@/lib/csv";

type DeploymentImportRow = {
  rowNumber: number;
  deploymentId: string;
  memberIds: string[];
  memberEmails: string[];
  projectId: string;
  projectCode: string;
  location: string;
  title: string | null;
  deploymentType: string | null;
  country: string | null;
  startDate: Date;
  endDate: Date;
  status: DeploymentStatus;
  notes: string | null;
  metadata: Prisma.InputJsonObject;
  action: "CREATE" | "UPDATE";
  raw: Record<string, string>;
};

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "deployment_import", status, error, code,
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
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "deployment");
  const customHeaders = metadataCsvHeaders(metadataFields);
  const table = parseCsvTable(body.csv);
  if (table.error) return fail(422, table.error, "VALIDATION_ERROR");
  const required = ["memberEmails", "projectCode", "location", "startDate", "endDate"];
  const supported = new Set(["deploymentId", ...required, "title", "deploymentType", "country", "status", "notes", ...customHeaders.keys()]);
  if (required.some((header) => !table.headers.includes(header)) || table.headers.some((header) => !supported.has(header))) {
    return fail(422, "Use the downloaded deployment template headers.", "VALIDATION_ERROR");
  }
  const rawRows = table.rows;
  const deploymentIds = rawRows.flatMap(({ values }) => values.deploymentId?.trim() ? [values.deploymentId.trim()] : []);
  if (new Set(deploymentIds).size !== deploymentIds.length) return fail(409, "The CSV repeats a deployment ID.", "CONFLICT");
  const memberEmails = [...new Set(rawRows.flatMap(({ values }) => values.memberEmails.split("|").map((email) => email.trim().toLowerCase()).filter(Boolean)))];
  const projectCodes = [...new Set(rawRows.map(({ values }) => values.projectCode.trim().toUpperCase()))];
  const [members, projects, existing] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: context.organizationId, user: { email: { in: memberEmails } } }, select: { id: true, isActive: true, user: { select: { email: true } } } }),
    db.project.findMany({ where: { organizationId: context.organizationId, code: { in: projectCodes } }, select: { id: true, code: true } }),
    deploymentIds.length ? db.deployment.findMany({ where: { id: { in: deploymentIds }, organizationId: context.organizationId }, include: { members: { select: { memberId: true } } } }) : Promise.resolve([]),
  ]);
  const memberByEmail = new Map(members.map((member) => [member.user.email.toLowerCase(), member]));
  const projectByCode = new Map(projects.map((project) => [project.code.toUpperCase(), project]));
  const existingById = new Map(existing.map((deployment) => [deployment.id, deployment]));
  const rows: DeploymentImportRow[] = [];
  for (const row of rawRows) {
    const values = row.values;
    const projectCode = values.projectCode.trim().toUpperCase();
    const project = projectByCode.get(projectCode);
    if (!project) return fail(422, `Row ${row.rowNumber}: project code is not in this organization.`, "NOT_FOUND");
    if (!(await can(context, "deployment.update", { projectId: project.id }))) return fail(403, `Row ${row.rowNumber}: you cannot manage deployments for this project.`, "FORBIDDEN");
    const emails = [...new Set(values.memberEmails.split("|").map((email) => email.trim().toLowerCase()).filter(Boolean))];
    const assigned = emails.map((email) => memberByEmail.get(email));
    if (!emails.length || assigned.some((member) => !member || !member.isActive)) return fail(422, `Row ${row.rowNumber}: choose active members in this organization.`, "VALIDATION_ERROR");
    const startDate = parseDate(values.startDate);
    const endDate = parseDate(values.endDate);
    if (!startDate || !endDate || endDate < startDate) return fail(422, `Row ${row.rowNumber}: enter a valid date range.`, "VALIDATION_ERROR");
    const status = values.status ? Object.values(DeploymentStatus).find((value) => value === values.status.toUpperCase()) : DeploymentStatus.UPCOMING;
    if (!status) return fail(422, `Row ${row.rowNumber}: choose a valid deployment status.`, "VALIDATION_ERROR");
    const custom = parseMetadataCsvValues(metadataFields, values, customHeaders);
    if (custom.error) return fail(422, `Row ${row.rowNumber}: ${custom.error}`, "VALIDATION_ERROR");
    const id = values.deploymentId?.trim() ?? "";
    const prior = id ? existingById.get(id) : undefined;
    if (id && !prior) return fail(422, `Row ${row.rowNumber}: deployment ID was not found in this organization.`, "NOT_FOUND");
    const metadata = await prepareMetadataValues(context.organizationId, "deployment", custom.values, prior?.metadata ?? undefined);
    if (!metadata.values) return fail(422, `Row ${row.rowNumber}: ${metadata.error ?? "Custom fields are invalid."}`, "VALIDATION_ERROR");
    rows.push({
      rowNumber: row.rowNumber,
      deploymentId: prior?.id ?? "",
      memberIds: assigned.map((member) => member!.id),
      memberEmails: emails,
      projectId: project.id,
      projectCode,
      location: values.location.trim(),
      title: values.title?.trim() || null,
      deploymentType: values.deploymentType?.trim() || null,
      country: values.country?.trim() || null,
      startDate,
      endDate,
      status,
      notes: values.notes?.trim() || null,
      metadata: metadata.values,
      action: prior ? "UPDATE" : "CREATE",
      raw: values,
    });
  }
  if (mode === "preview") {
    return NextResponse.json({ data: {
      rows: rows.map(({ rowNumber, action, projectCode, location, memberEmails }) => ({ rowNumber, action, summary: `${location} · ${projectCode} · ${memberEmails.join(", ")}` })),
      created: rows.filter(({ action }) => action === "CREATE").length,
      updated: rows.filter(({ action }) => action === "UPDATE").length,
      skipped: 0,
    } });
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const before = row.deploymentId
        ? await tx.deployment.findFirst({ where: { id: row.deploymentId, organizationId: context.organizationId }, include: { members: { select: { memberId: true } } } })
        : null;
      if (row.deploymentId && !before) throw new CsvImportError(`Row ${row.rowNumber}: deployment changed during import. Preview the file again.`, 409, "CONFLICT");
      const memberIds = row.memberIds;
      const custom = parseMetadataCsvValues(metadataFields, row.raw, customHeaders);
      if (custom.error) throw new CsvImportError(`Row ${row.rowNumber}: ${custom.error}`);
      const metadata = await prepareMetadataValues(context.organizationId, "deployment", custom.values, before?.metadata ?? undefined, tx);
      if (!metadata.values) throw new CsvImportError(`Row ${row.rowNumber}: ${metadata.error ?? "Custom fields are invalid."}`);
      const conflictFlags = tagConflictsByMember(await Promise.all(memberIds.map(async (memberId) => ({
        memberId,
        conflicts: await getDeploymentConflicts({
          organizationId: context.organizationId,
          memberId,
          startDate: row.startDate,
          endDate: row.endDate,
          status: row.status,
          client: tx,
        }),
      }))));
      const data = {
        memberId: memberIds[0],
        projectId: row.projectId,
        location: row.location,
        title: row.raw.title ? row.title : before?.title ?? row.title,
        deploymentType: row.raw.deploymentType ? row.deploymentType : before?.deploymentType ?? row.deploymentType,
        country: row.raw.country ? row.country : before?.country ?? row.country,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.raw.status ? row.status : before?.status ?? row.status,
        notes: row.raw.notes ? row.notes : before?.notes ?? row.notes,
        metadata: metadata.values,
        conflictFlags: conflictFlags as Prisma.InputJsonValue,
      };
      const deployment = before
        ? await tx.deployment.update({ where: { id_organizationId: { id: before.id, organizationId: context.organizationId } }, data })
        : await tx.deployment.create({ data: { ...data, organizationId: context.organizationId } });
      await tx.deploymentMember.deleteMany({ where: { deploymentId: deployment.id, organizationId: context.organizationId } });
      await tx.deploymentMember.createMany({ data: memberIds.map((memberId) => ({ deploymentId: deployment.id, memberId, organizationId: context.organizationId })) });
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: before ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: "deployment",
        entityId: deployment.id,
        before: before ? { location: before.location, startDate: before.startDate.toISOString().slice(0, 10), endDate: before.endDate.toISOString().slice(0, 10), status: before.status } : null,
        after: { location: deployment.location, startDate: deployment.startDate.toISOString().slice(0, 10), endDate: deployment.endDate.toISOString().slice(0, 10), status: deployment.status },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      if (before) updated += 1;
      else created += 1;
    }
    return { created, updated, skipped: 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
      if (error instanceof CsvImportError) return fail(error.status, error.message, error.code);
      throw error;
  }
  return NextResponse.json({ data: result });
}
