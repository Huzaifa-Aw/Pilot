"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type PreviewRow = { rowNumber: number; action: "CREATE" | "UPDATE" | "SKIP" | "ERROR"; summary: string };
type ImportPreview = { rows: PreviewRow[]; created: number; updated: number; skipped: number };

export function CsvImportPanel({
  title,
  endpoint,
  template,
  help,
  maxRows = 500,
}: {
  title: string;
  endpoint: string;
  template: string;
  help: string;
  maxRows?: number;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-template.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function previewImport() {
    setError("");
    setReference("");
    setMessage("");
    setPreview(null);
    setPending("preview");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, mode: "preview" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "The CSV couldn't be checked.");
        setReference(result.reference ?? "");
        return;
      }
      setPreview(result.data);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function commitImport() {
    setError("");
    setReference("");
    setMessage("");
    setPending("commit");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, mode: "commit" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "The import couldn't be completed.");
        setReference(result.reference ?? "");
        setPreview(null);
        return;
      }
      setMessage(`${result.data.created} created · ${result.data.updated} updated · ${result.data.skipped} skipped.`);
      setCsv("");
      setFileName("");
      setPreview(null);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <details className="rounded-lg border border-border-default bg-surface">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-brand-primary">{title}</summary>
      <div className="space-y-3 border-t border-border-default p-4">
        <p className="text-sm text-text-secondary">{help}</p>
        <Button type="button" variant="secondary" onClick={downloadTemplate}>Download CSV template</Button>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-secondary">Choose CSV file (up to 1 MB, {maxRows} rows)</span>
          <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 1_000_000) {
              setError("CSV must be smaller than 1 MB.");
              event.target.value = "";
              return;
            }
            try {
              setError("");
              setMessage("");
              setPreview(null);
              setCsv(await file.text());
              setFileName(file.name);
            } catch {
              setError("We couldn't read that CSV file. Choose another file or paste its contents.");
              event.target.value = "";
            }
          }} className="block min-h-11 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm" />
        </label>
        {fileName && <p className="text-xs text-text-muted">Selected: {fileName}</p>}
        <details>
          <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold text-brand-primary">Paste CSV instead</summary>
          <textarea value={csv} onChange={(event) => {
            setCsv(event.target.value);
            setFileName("");
            setPreview(null);
            if (fileInput.current) fileInput.current.value = "";
          }} maxLength={1_000_000} rows={6} placeholder="Paste CSV content" className="w-full rounded-md border border-border-default px-3 py-2 font-mono text-xs" />
        </details>
        {error && <p role="alert" className="text-sm text-error-dark">{error}{reference && <span className="ml-2 font-mono text-xs">Reference: {reference}</span>}</p>}
        {message && <p role="status" className="text-sm text-success-dark">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={pending !== null || !csv.trim()} onClick={() => void previewImport()}>{pending === "preview" ? "Checking..." : "Preview changes"}</Button>
          {preview && <Button type="button" disabled={pending !== null || preview.rows.some(({ action }) => action === "ERROR")} onClick={() => void commitImport()}>{pending === "commit" ? "Importing..." : "Confirm import"}</Button>}
        </div>
        {preview && (
          <section aria-label="CSV import preview" className="space-y-2">
            <p className="text-xs font-semibold text-text-secondary">{preview.created} new · {preview.updated} updates · {preview.skipped} unchanged</p>
            <div className="max-h-64 overflow-auto rounded-md border border-border-default">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-50"><tr><th className="px-2 py-2">Row</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Details</th></tr></thead>
                <tbody className="divide-y divide-border-default">
                  {preview.rows.slice(0, 50).map((row) => <tr key={row.rowNumber}><td className="px-2 py-2 tabular-nums">{row.rowNumber}</td><td className="px-2 py-2 font-medium">{row.action}</td><td className="px-2 py-2 text-text-secondary">{row.summary}</td></tr>)}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 50 && <p className="text-xs text-text-muted">Showing the first 50 preview rows.</p>}
          </section>
        )}
      </div>
    </details>
  );
}
