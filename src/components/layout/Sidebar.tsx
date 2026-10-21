import Link from "next/link";
import type { MemberRole } from "@prisma/client";
import { cn } from "../ui/utils";
import { navigationItems, workspaceIcon as WorkspaceIcon } from "./navigation";
import { roleAtLeast } from "@/lib/rbac";

export interface SidebarProps {
  currentPath?: string;
  workspaceName?: string;
  role?: MemberRole;
}

export function Sidebar({ currentPath, workspaceName = "Engineering workspace", role }: SidebarProps) {
  const visibleItems = navigationItems.filter((item) => roleAtLeast(role, item.minRole));

  return (
    <aside className="hidden h-dvh w-sidebar shrink-0 flex-col bg-sidebar px-4 py-6 text-white md:flex">
      <Link href="/overview" className="mb-8 flex min-h-11 items-center gap-3 rounded-md px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        <span className="flex size-9 items-center justify-center rounded-md bg-brand-primary text-white">
          <WorkspaceIcon aria-hidden="true" size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{workspaceName}</span>
          <span className="mt-0.5 block text-xs text-white/60">Team workspace</span>
        </span>
      </Link>

      <nav aria-label="Primary navigation" className="flex-1">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-white/45">Workspace</p>
        <ul className="space-y-1">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = currentPath === href || (href !== "/overview" && currentPath?.startsWith(`${href}/`));
            return (
              <li key={href}>
                <Link
                  href={href}
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
  );
}
