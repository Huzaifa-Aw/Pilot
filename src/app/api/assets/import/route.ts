import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { auditUserFailureResponse, isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { getDefaultMetadataFields, prepareMetadataValues } from "@/lib/metadata";
import { metadataCsvHeaders, parseMetadataCsvValues } from "@/lib/metadata-csv";
import { parseAssetCsv } from "@/lib/asset-csv";
import { CsvImportError } from "@/lib/csv";

type ImportMode = "preview" | "commit";

function assetDataFromRow(row: Record<string, string>, asset: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const field of ["title", "description", "category", "status", "location", "serialNumber", "acquiredOn", "nextServiceDate"]) {
    if (row[field] !== undefined && row[field] !== "") values[field] = asset[field];
  }
  return values;
}

function assetFields(row: {
  assetCode: string;
  title: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  location?: string | null;
  serialNumber?: string | null;
  acquiredOn?: Date | null;
  nextServiceDate?: Date | null;
}) {
  return {
    assetCode: row.assetCode,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    location: row.location,
    serialNumber: row.serialNumber,
    acquiredOn: row.acquiredOn,
    nextServiceDate: row.nextServiceDate,
  };
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const fail = (status: number, error: string, code: string) => auditUserFailureResponse({
    request, context, action: AuditAction.IMPORT, entityType: "asset_import", status, error, code,
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
  const mode: ImportMode = "mode" in body && body.mode === "commit" ? "commit" : "preview";
  if ("mode" in body && body.mode !== "preview" && body.mode !== "commit") {
    return fail(422, "Choose preview or confirm the import.", "VALIDATION_ERROR");
  }

  const fields = await getDefaultMetadataFields(context.organizationId, "asset");
  const customHeaders = metadataCsvHeaders(fields);
  const parsed = parseAssetCsv(body.csv, customHeaders);
  if (parsed.error) return fail(422, parsed.error, "VALIDATION_ERROR");
  const existingAssets = await db.asset.findMany({
    where: { organizationId: context.organizationId, assetCode: { in: parsed.assets.map(({ assetCode }) => assetCode) } },
    select: { id: true, assetCode: true, metadata: true },
  });
  const existingByCode = new Map(existingAssets.map((asset) => [asset.assetCode.toUpperCase(), asset]));
  const preparedRows: Array<{
    rowNumber: number;
    action: "CREATE" | "UPDATE";
    summary: string;
    asset: ReturnType<typeof assetFields>;
    rawValues: Record<string, string>;
    customValues: Record<string, string>;
    metadata: Prisma.InputJsonObject;
  }> = [];

  for (const row of parsed.assets) {
    const existing = existingByCode.get(row.assetCode.toUpperCase());
    const custom = parseMetadataCsvValues(fields, row.customValues, customHeaders);
    if (custom.error) return fail(422, `Row ${row.rowNumber}: ${custom.error}`, "VALIDATION_ERROR");
    const metadata = await prepareMetadataValues(context.organizationId, "asset", custom.values, existing?.metadata ?? undefined);
    if (!metadata.values) return fail(422, `Row ${row.rowNumber}: ${metadata.error ?? "Custom field values are invalid."}`, "VALIDATION_ERROR");
    const asset = assetFields(row);
    preparedRows.push({
      rowNumber: row.rowNumber,
      action: existing ? "UPDATE" as const : "CREATE" as const,
      summary: existing ? `${row.assetCode} will update the matching asset.` : `${row.assetCode} will create a new asset.`,
      asset,
      rawValues: row.rawValues,
      customValues: row.customValues,
      metadata: metadata.values,
    });
  }

  if (mode === "preview") {
    return NextResponse.json({
      data: {
        rows: preparedRows.map(({ rowNumber, action, summary }) => ({ rowNumber, action, summary })),
        created: preparedRows.filter(({ action }) => action === "CREATE").length,
        updated: preparedRows.filter(({ action }) => action === "UPDATE").length,
        skipped: 0,
      },
    });
  }

  try {
    const counts = await db.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const row of preparedRows) {
        const assetCode = row.asset.assetCode;
        const existing = await tx.asset.findFirst({
          where: { organizationId: context.organizationId, assetCode },
        });
        const custom = parseMetadataCsvValues(fields, row.customValues, customHeaders);
        if (custom.error) throw new CsvImportError(`Row ${row.rowNumber}: ${custom.error}`);
        const metadata = await prepareMetadataValues(context.organizationId, "asset", custom.values, existing?.metadata ?? undefined, tx);
        if (!metadata.values) throw new CsvImportError(`Row ${row.rowNumber}: ${metadata.error ?? "Custom field values are invalid."}`);
        const updateData = assetDataFromRow(row.rawValues, row.asset);
        if (existing) {
          const before = { assetCode: existing.assetCode, title: existing.title, category: existing.category, status: existing.status, location: existing.location };
          const updatedAsset = await tx.asset.update({
            where: { id_organizationId: { id: existing.id, organizationId: context.organizationId } },
            data: { ...updateData, metadata: metadata.values },
          });
          await createAuditEvent({
            organizationId: context.organizationId,
            actorId: context.userId,
            action: AuditAction.UPDATE,
            entityType: "asset",
            entityId: updatedAsset.id,
            before,
            after: { assetCode: updatedAsset.assetCode, title: updatedAsset.title, category: updatedAsset.category, status: updatedAsset.status, location: updatedAsset.location },
            userAgent: request.headers.get("user-agent"),
          }, tx);
          updated += 1;
        } else {
          const createdAsset = await tx.asset.create({
            data: { ...row.asset, metadata: metadata.values, organizationId: context.organizationId },
          });
          await createAuditEvent({
            organizationId: context.organizationId,
            actorId: context.userId,
            action: AuditAction.CREATE,
            entityType: "asset",
            entityId: createdAsset.id,
            after: { assetCode: createdAsset.assetCode, title: createdAsset.title, category: createdAsset.category, status: createdAsset.status, location: createdAsset.location },
            userAgent: request.headers.get("user-agent"),
          }, tx);
          created += 1;
        }
      }
      return { kind: "complete" as const, created, updated, skipped: 0 };
    });
    return NextResponse.json({ data: counts });
  } catch (error) {
    if (error instanceof CsvImportError) return fail(error.status, error.message, error.code);
    if (isUniqueViolation(error)) {
      return fail(409, "An asset code changed during import. Preview the file again.", "CONFLICT");
    }
    throw error;
  }
}
