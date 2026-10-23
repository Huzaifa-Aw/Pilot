import { AuditAction, Prisma, ProjectStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { getDefaultMetadataFields, prepareMetadataValues } from "@/lib/metadata";
import { metadataCsvHeaders, parseMetadataCsvValues } from "@/lib/metadata-csv";
import { parseCsvTable } from "@/lib/csv";
import { CsvImportError } from "@/lib/csv";
import { createDefaultTaskWorkflow } from "@/lib/task-workflows";
import { projectCreateSchema } from "@/lib/validations/project";
import { PROJECT_STATUSES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { z } from "zod";

type ProjectImportRow = {
  rowNumber: number;
  action: "CREATE" | "UPDATE";
  summary: string;
  data: z.infer<typeof projectCreateSchema>;
  metadata: Prisma.InputJsonObject;
  raw: Record<string, string>;
};

const standardHeaders = new Set(["code", "title", "description", "status", "startDate", "endDate", "budgetHours", "workflow"]);

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "project_import", status, error, code,
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
  if ("mode" in body && body.mode !== "preview" && body.mode !== "commit") {
    return fail(422, "Choose preview or confirm the import.", "VALIDATION_ERROR");
  }
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "project");
  const customHeaders = metadataCsvHeaders(metadataFields);
  const table = parseCsvTable(body.csv);
  if (table.error) return fail(422, table.error, "VALIDATION_ERROR");
  const codesInFile = table.rows.map(({ values }) => values.code.trim().toUpperCase());
  if (new Set(codesInFile).size !== codesInFile.length) return fail(409, "Project codes must be unique in the CSV.", "CONFLICT");
  if (table.headers.some((header) => !standardHeaders.has(header) && !customHeaders.has(header))) {
    return fail(422, "Use the downloaded project template headers.", "VALIDATION_ERROR");
  }
  if (!table.headers.includes("code") || !table.headers.includes("title")) {
    return fail(422, "CSV requires code and title columns.", "VALIDATION_ERROR");
  }
  const [workflows, existingProjects] = await Promise.all([
    db.taskWorkflow.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true, isDefault: true } }),
    db.project.findMany({
      where: { organizationId: context.organizationId },
      select: { id: true, code: true, metadata: true, workflowId: true, _count: { select: { tasks: true } } },
    }),
  ]);
  const workflowByName = new Map(workflows.map((workflow) => [workflow.name.toLowerCase(), workflow]));
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const defaultWorkflow = workflows.find(({ isDefault }) => isDefault);
  const existingByCode = new Map(existingProjects.map((project) => [project.code.toUpperCase(), project]));
  const rows: ProjectImportRow[] = [];
  for (const row of table.rows) {
    const code = row.values.code.trim().toUpperCase();
    const existing = existingByCode.get(code);
    if (existing && !(await can(context, "project.update", { projectId: existing.id }))) {
      return fail(403, `Row ${row.rowNumber}: you do not have access to update this project.`, "FORBIDDEN");
    }
    const rawStatus = row.values.status?.trim().toUpperCase();
    if (rawStatus && !PROJECT_STATUSES.includes(rawStatus as ProjectStatus)) {
      return fail(422, `Row ${row.rowNumber} has an unsupported project status.`, "VALIDATION_ERROR");
    }
    const workflow = row.values.workflow?.trim()
      ? workflowByName.get(row.values.workflow.trim().toLowerCase())
      : existing?.workflowId
        ? workflowById.get(existing.workflowId)
        : defaultWorkflow;
    if (row.values.workflow?.trim() && !workflow) {
      return fail(422, `Row ${row.rowNumber} names a workflow that is not available in this organization.`, "VALIDATION_ERROR");
    }
    const custom = parseMetadataCsvValues(metadataFields, row.values, customHeaders);
    if (custom.error) return fail(422, `Row ${row.rowNumber}: ${custom.error}`, "VALIDATION_ERROR");
    const candidate = projectCreateSchema.safeParse({
      code,
      title: row.values.title,
      description: row.values.description ?? "",
      status: rawStatus || "PLANNING",
      startDate: row.values.startDate ?? "",
      endDate: row.values.endDate ?? "",
      budgetHours: row.values.budgetHours === undefined || row.values.budgetHours === "" ? null : Number(row.values.budgetHours),
      workflowId: workflow?.id,
      metadata: custom.values,
    });
    if (!candidate.success) {
      return fail(422, `Row ${row.rowNumber} is invalid: ${candidate.error.issues[0]?.message ?? "Check project details."}`, "VALIDATION_ERROR");
    }
    if (existing && workflow && existing.workflowId !== workflow.id && existing._count.tasks > 0) {
      return fail(409, `Row ${row.rowNumber}: change this project's workflow in Project settings before importing a different one.`, "WORKFLOW_STATUS_CONFLICT");
    }
    const metadata = await prepareMetadataValues(context.organizationId, "project", candidate.data.metadata ?? {}, existing?.metadata ?? undefined);
    if (!metadata.values) return fail(422, `Row ${row.rowNumber}: ${metadata.error ?? "Custom fields are invalid."}`, "VALIDATION_ERROR");
    rows.push({
      rowNumber: row.rowNumber,
      action: existing ? "UPDATE" as const : "CREATE" as const,
      summary: existing ? `${code} will update the matching project.` : `${code} will create a project.`,
      data: candidate.data,
      metadata: metadata.values,
      raw: row.values,
    });
  }
  const preview = {
    rows: rows.map(({ rowNumber, action, summary }) => ({ rowNumber, action, summary })),
    created: rows.filter(({ action }) => action === "CREATE").length,
    updated: rows.filter(({ action }) => action === "UPDATE").length,
    skipped: 0,
  };
  if (mode === "preview") return NextResponse.json({ data: preview });

  try {
    const result = await db.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const code = row.data.code.toUpperCase();
        const existing = await tx.project.findFirst({
          where: { organizationId: context.organizationId, code },
        });
        const workflow = row.data.workflowId
          ? await tx.taskWorkflow.findFirst({ where: { id: row.data.workflowId, organizationId: context.organizationId }, select: { id: true } })
          : await createDefaultTaskWorkflow(tx, context.organizationId);
        if (!workflow) throw new CsvImportError(`Row ${row.rowNumber}: select a workflow in this organization.`);
        const custom = parseMetadataCsvValues(metadataFields, row.raw, customHeaders);
        if (custom.error) throw new CsvImportError(`Row ${row.rowNumber}: ${custom.error}`);
        const metadata = await prepareMetadataValues(context.organizationId, "project", custom.values, existing?.metadata ?? undefined, tx);
        if (!metadata.values) throw new CsvImportError(`Row ${row.rowNumber}: ${metadata.error ?? "Custom fields are invalid."}`);
        if (existing) {
          const update: Prisma.ProjectUncheckedUpdateInput = {
            metadata: metadata.values,
            workflowId: workflow.id,
            ...(row.raw.title ? { title: row.data.title } : {}),
            ...(row.raw.description ? { description: row.data.description } : {}),
            ...(row.raw.status ? { status: row.data.status } : {}),
            ...(row.raw.startDate ? { startDate: row.data.startDate } : {}),
            ...(row.raw.endDate ? { endDate: row.data.endDate } : {}),
            ...(row.raw.budgetHours ? { budgetHours: row.data.budgetHours } : {}),
          };
          const after = await tx.project.update({
            where: { id_organizationId: { id: existing.id, organizationId: context.organizationId } },
            data: update,
          });
          await createAuditEvent({
            organizationId: context.organizationId,
            actorId: context.userId,
            action: AuditAction.UPDATE,
            entityType: "project",
            entityId: after.id,
            before: { id: existing.id, code: existing.code, title: existing.title, workflowId: existing.workflowId },
            after: { id: after.id, code: after.code, title: after.title, workflowId: after.workflowId },
            userAgent: request.headers.get("user-agent"),
          }, tx);
          updated += 1;
        } else {
          const createdProject = await tx.project.create({
            data: {
              ...row.data,
              code,
              workflowId: workflow.id,
              metadata: metadata.values,
              organizationId: context.organizationId,
            },
          });
          await tx.projectMember.create({
            data: { organizationId: context.organizationId, projectId: createdProject.id, memberId: context.memberId, role: "LEAD" },
          });
          await createAuditEvent({
            organizationId: context.organizationId,
            actorId: context.userId,
            action: AuditAction.CREATE,
            entityType: "project",
            entityId: createdProject.id,
            after: { id: createdProject.id, code: createdProject.code, title: createdProject.title, workflowId: createdProject.workflowId },
            userAgent: request.headers.get("user-agent"),
          }, tx);
          created += 1;
        }
      }
      return { kind: "complete" as const, created, updated, skipped: 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof CsvImportError) return fail(error.status, error.message, error.code);
    if (isUniqueViolation(error)) return fail(409, "A project code changed during import. Preview the file again.", "CONFLICT");
    throw error;
  }
}
