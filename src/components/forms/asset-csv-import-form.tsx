import { CsvImportPanel } from "@/components/forms/csv-import-panel";

export function AssetCsvImportForm({ template }: { template: string }) {
  return (
    <CsvImportPanel
      title="Import assets from CSV"
      endpoint="/api/assets/import"
      template={template}
      help="Required columns: assetCode and title. Matching asset codes update existing assets; blank cells keep existing values. Dates use YYYY-MM-DD."
    />
  );
}
