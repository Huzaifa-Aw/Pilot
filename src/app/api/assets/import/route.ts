import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isUniqueViolation, requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { parseAssetCsv } from "@/lib/asset-csv";
import { prepareMetadataValues } from "@/lib/metadata";

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    throw error;
  }
  if (!body || typeof body !== "object" || !("csv" in body) || typeof body.csv !== "string") {
    return NextResponse.json({ error: "Provide the CSV content.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  const parsed = parseAssetCsv(body.csv);
  if (parsed.error) return NextResponse.json({ error: parsed.error, code: "VALIDATION_ERROR" }, { status: 422 });

  try {
    const result = await db.$transaction(async (tx) => {
      const created = [];
      for (const input of parsed.assets) {
        const metadata = await prepareMetadataValues(context.organizationId, "asset", input.metadata ?? {}, undefined, tx);
        if (metadata.error) return { kind: "metadata" as const, error: metadata.error };
        const asset = await tx.asset.create({
          data: { ...input, metadata: metadata.values, organizationId: context.organizationId },
        });
        await createAuditEvent({
          organizationId: context.organizationId,
          actorId: context.userId,
          action: AuditAction.CREATE,
          entityType: "asset",
          entityId: asset.id,
          after: { id: asset.id, assetCode: asset.assetCode, title: asset.title, category: asset.category, status: asset.status },
          userAgent: request.headers.get("user-agent"),
        }, tx);
        created.push({ id: asset.id, assetCode: asset.assetCode });
      }
      return { kind: "created" as const, assets: created };
    });
    if (result.kind === "metadata") return NextResponse.json({ error: result.error, code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
    return NextResponse.json({ data: result.assets }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "An asset code in the CSV already exists in this organization.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
