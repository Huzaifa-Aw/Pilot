export type CsvRow = { rowNumber: number; values: Record<string, string> };

export class CsvImportError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly code = "VALIDATION_ERROR",
  ) {
    super(message);
  }
}

export function serializeCsvRow(values: string[]) {
  return values.map((value) => /[",\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value).join(",");
}

export function parseCsvTable(input: string, maxRows = 500) {
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
  if (rows.length < 2) return { error: "Add a header and at least one data row." as const };
  if (rows.length > maxRows + 1) return { error: `Import up to ${maxRows} rows at a time.` as const };

  const [headers, ...dataRows] = rows;
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    return { error: "CSV headers must be present and unique." as const };
  }
  const parsedRows: CsvRow[] = [];
  for (const [index, values] of dataRows.entries()) {
    if (values.length !== headers.length) return { error: `Row ${index + 2} has a different number of columns than the header.` as const };
    parsedRows.push({
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, values[column]])),
    });
  }
  return { error: null, headers, rows: parsedRows };
}
