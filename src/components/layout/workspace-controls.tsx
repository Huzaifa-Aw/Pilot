"use client";

import { signOut, useSession } from "next-auth/react";
import { ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkspaceOption } from "./dashboard-frame";

export function WorkspaceControls({
  organizationName,
  organizations,
  userName,
}: {
  organizationName: string;
  organizations: WorkspaceOption[];
  userName: string;
}) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  async function switchOrganization(organizationId: string) {
    if (organizationId === session?.user?.activeOrganizationId || switching) return;
    setError("");
    setSwitching(true);
    try {
      const updated = await update({ activeOrganizationId: organizationId });
      if (updated?.user.activeOrganizationId !== organizationId) {
        throw new Error("The selected organization is not available to this account.");
      }
      window.localStorage.setItem("workspace:active-organization", `${organizationId}:${Date.now()}`);
      router.replace("/overview");
    } catch {
      setError("We couldn't switch organizations. Refresh the page and try again.");
      setSwitching(false);
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      {organizations.length > 1 ? (
        <label className="relative flex min-h-11 max-w-28 items-center md:max-w-48">
          <span className="sr-only">Active organization</span>
          <select
            aria-label="Active organization"
            className="min-h-11 max-w-28 appearance-none rounded-md border border-border-default bg-surface py-2 pl-2 pr-7 text-xs font-medium text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15 md:max-w-48 md:pl-3 md:pr-9 md:text-sm"
            value={session?.user?.activeOrganizationId ?? ""}
            disabled={switching}
            onChange={(event) => void switchOrganization(event.target.value)}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-2 text-text-muted md:right-3 md:size-4" />
        </label>
      ) : (
        <span className="max-w-24 truncate text-[11px] font-medium text-text-secondary md:max-w-40 md:text-sm">
          {organizationName}
        </span>
      )}
      <span className="hidden max-w-32 truncate text-sm text-text-muted xl:block">{userName}</span>
      <button
        type="button"
        onClick={() => void signOut({ redirectTo: "/login" })}
        aria-label="Sign out"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-neutral-100 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <LogOut aria-hidden="true" size={18} />
      </button>
      {error && <span role="alert" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-md border border-error-light bg-surface px-3 py-2 text-xs text-error-dark shadow-md">{error}</span>}
    </div>
  );
}
