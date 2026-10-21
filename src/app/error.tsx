"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application route failed", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Unexpected error</p>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-text-primary">This page couldn&apos;t load</h1>
      <p className="text-sm text-text-secondary">Try again. If the problem continues, contact your workspace administrator.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-primary px-4 text-sm font-semibold text-text-inverse transition-colors duration-150 hover:bg-brand-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        Try again
      </button>
      {error.digest && <p className="font-mono text-xs text-text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
