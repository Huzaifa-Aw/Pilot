"use client";

import { useCallback, useState } from "react";
import type { MemberRole } from "@prisma/client";
import { Menu } from "lucide-react";
import { Button } from "../ui/button";
import { MobileNav } from "./MobileNav";

export interface TopbarProps {
  title?: string;
  currentPath?: string;
  workspaceName?: string;
  actions?: React.ReactNode;
  role?: MemberRole;
}

export function Topbar({
  title = "Engineering workspace",
  currentPath,
  workspaceName,
  actions,
  role,
}: TopbarProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);

  return (
    <>
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border-default bg-surface px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={navigationOpen}
            aria-controls="mobile-navigation"
            onClick={() => setNavigationOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <span aria-hidden="true" className="truncate font-heading text-lg font-semibold tracking-tight text-text-primary md:text-xl">{title}</span>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <MobileNav
        open={navigationOpen}
        onClose={closeNavigation}
        currentPath={currentPath}
        workspaceName={workspaceName}
        role={role}
      />
    </>
  );
}
