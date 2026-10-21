"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const example = "assetCode,title,category,status,location,serialNumber,description\nTOOL-101,Inspection kit,Tools,ACTIVE,Store room A,SN-101,Quarterly inspection equipment";

export function AssetCsvImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/assets/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Assets couldn't be imported.");
        return;
      }
      setMessage(`${result.data.length} assets imported.`);
      setCsv("");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-lg border border-border-default bg-surface">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-brand-primary">Import assets from CSV</summary>
      <form onSubmit={(event) => void submit(event)} className="space-y-3 border-t border-border-default p-4" noValidate>
        <p className="text-sm text-text-secondary">Required columns: <code className="font-mono text-xs">assetCode,title</code>. Optional: category, status, location, serialNumber, description. Up to 500 rows, 1 MB.</p>
        <button type="button" onClick={() => setCsv(example)} className="min-h-11 text-xs font-semibold text-brand-primary hover:underline">Load example CSV</button>
        <label className="block space-y-1"><span className="sr-only">CSV content</span><textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={6} maxLength={1_000_000} required placeholder="Paste CSV content here" className="w-full rounded-md border border-border-default bg-surface px-3 py-2 font-mono text-xs" /></label>
        {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
        {message && <p role="status" className="text-sm text-success-dark">{message}</p>}
        <button type="submit" disabled={pending || !csv.trim()} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Importing..." : "Import assets"}</button>
      </form>
    </details>
  );
}
