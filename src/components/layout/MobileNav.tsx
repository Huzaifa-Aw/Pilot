"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { MemberRole } from "@prisma/client";
import { X } from "lucide-react";
import { cn } from "../ui/utils";
import { navigationItems, workspaceIcon as WorkspaceIcon } from "./navigation";
import { roleAtLeast } from "@/lib/rbac";

export interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  currentPath?: string;
  workspaceName?: string;
  role?: MemberRole;
}

export function MobileNav({ open, onClose, currentPath, workspaceName = "Engineering workspace", role }: MobileNavProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const visibleItems = navigationItems.filter((item) => roleAtLeast(role, item.minRole));

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/50 motion-safe:animate-backdrop-in"
      />
      <aside
        id="mobile-navigation"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        className="relative flex h-dvh w-[min(18rem,calc(100%-3rem))] flex-col bg-sidebar px-4 py-5 text-white shadow-xl motion-safe:animate-[modal-in_200ms_ease_forwards]"
      >
        <div className="mb-8 flex min-h-11 items-center justify-between gap-3">
          <Link href="/overview" onClick={onClose} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-primary text-white">
              <WorkspaceIcon aria-hidden="true" size={20} />
            </span>
            <span id="mobile-navigation-title" className="truncate text-sm font-semibold">{workspaceName}</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-white/75 transition-colors duration-150 hover:bg-sidebar-hover hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <nav aria-label="Primary navigation" className="flex-1">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-white/45">Workspace</p>
          <ul className="space-y-1">
            {visibleItems.map(({ href, label, icon: Icon }) => {
              const active = currentPath === href || (href !== "/overview" && currentPath?.startsWith(`${href}/`));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-sidebar-hover hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                      active && "bg-sidebar-active text-white hover:bg-sidebar-active",
                    )}
                  >
                    <Icon aria-hidden="true" size={20} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
