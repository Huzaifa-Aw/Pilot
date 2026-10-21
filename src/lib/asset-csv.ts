import { assetCreateSchema } from "@/lib/validations/asset";

const allowedHeaders = new Set(["assetCode", "title", "category", "status", "location", "serialNumber", "description"]);
const requiredHeaders = ["assetCode", "title"] as const;

export function parseAssetCsv(input: string) {
  if (input.length > 1_000_000) return { error: "CSV must be smaller than 1 MB." as const };
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = input.charCodeAt(0) === 0xfeff ? 1 : 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === "\"" && input[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") quoted = false;
      else cell += character;
    } else if (character === "\"" && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else cell += character;
  }
  if (quoted) return { error: "CSV contains an unclosed quoted value." as const };
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length < 2) return { error: "Add a header and at least one asset row." as const };
  if (rows.length > 501) return { error: "Import up to 500 assets at a time." as const };

  const [headers, ...dataRows] = rows;
  if (new Set(headers).size !== headers.length || headers.some((header) => !allowedHeaders.has(header))) {
    return { error: "Use unique supported headers: assetCode, title, category, status, location, serialNumber, description." as const };
  }
  if (requiredHeaders.some((header) => !headers.includes(header))) {
    return { error: "CSV requires assetCode and title columns." as const };
  }
  const assets = [];
  for (const [index, values] of dataRows.entries()) {
    if (values.length !== headers.length) return { error: `Row ${index + 2} has a different number of columns than the header.` as const };
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    const status = record.status?.toUpperCase();
    if (status && !["ACTIVE", "MAINTENANCE", "RETIRED", "INACTIVE"].includes(status)) {
      return { error: `Row ${index + 2} has an unsupported status.` as const };
    }
    const candidate = {
      ...record,
      ...(status ? { status } : {}),
    };
    const parsed = assetCreateSchema.safeParse(candidate);
    if (!parsed.success) return { error: `Row ${index + 2} is invalid: ${parsed.error.issues[0]?.message ?? "check asset details."}` as const };
    assets.push(parsed.data);
  }
  const codes = assets.map(({ assetCode }) => assetCode.toUpperCase());
  if (new Set(codes).size !== codes.length) return { error: "Asset codes must be unique within the CSV." as const };
  return { error: null, assets };
}
