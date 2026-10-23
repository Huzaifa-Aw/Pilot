import { assetCreateSchema } from "@/lib/validations/asset";
import { parseCsvTable } from "@/lib/csv";

const allowedHeaders = new Set(["assetCode", "title", "category", "status", "location", "serialNumber", "description", "acquiredOn", "nextServiceDate"]);
const requiredHeaders = ["assetCode", "title"] as const;

export function parseAssetCsv(input: string, customHeaders: Map<string, string> = new Map()) {
  const table = parseCsvTable(input);
  if (table.error) return { error: table.error };
  if (table.headers.some((header) => !allowedHeaders.has(header) && !customHeaders.has(header))) {
    return { error: "Use the downloaded template headers and do not rename columns." as const };
  }
  if (requiredHeaders.some((header) => !table.headers.includes(header))) {
    return { error: "CSV requires assetCode and title columns." as const };
  }

  const assets = [];
  for (const row of table.rows) {
    const standardValues = Object.fromEntries(Object.entries(row.values).filter(([header]) => !customHeaders.has(header)));
    const customValues = Object.fromEntries(Object.entries(row.values)
      .flatMap(([header, value]) => customHeaders.has(header) ? [[customHeaders.get(header)!, value]] : []));
    const status = standardValues.status?.toUpperCase();
    if (status && !["ACTIVE", "MAINTENANCE", "RETIRED", "INACTIVE"].includes(status)) {
      return { error: `Row ${row.rowNumber} has an unsupported status.` as const };
    }
    const parsed = assetCreateSchema.safeParse({ ...standardValues, assetCode: standardValues.assetCode?.toUpperCase(), ...(status ? { status } : {}) });
    if (!parsed.success) {
      return { error: `Row ${row.rowNumber} is invalid: ${parsed.error.issues[0]?.message ?? "check asset details."}` as const };
    }
    assets.push({ ...parsed.data, rowNumber: row.rowNumber, customValues, rawValues: row.values });
  }
  const codes = assets.map(({ assetCode }) => assetCode.toUpperCase());
  if (new Set(codes).size !== codes.length) return { error: "Asset codes must be unique within the CSV." as const };
  return { error: null, assets };
}
