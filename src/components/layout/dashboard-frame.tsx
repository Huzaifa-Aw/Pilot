"use client";

import { usePathname } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { WorkspaceControls } from "@/components/layout/workspace-controls";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
};

export function DashboardFrame({
  children,
  organizationName,
  organizations,
  role,
  userName,
  activeOrganizationId,
}: {
  children: React.ReactNode;
  organizationName: string;
  organizations: WorkspaceOption[];
  role: MemberRole;
  userName: string;
  activeOrganizationId: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const title = navigationTitle(pathname);

  useEffect(() => {
    if (
      session?.user?.activeOrganizationId &&
      session.user.activeOrganizationId !== activeOrganizationId
    ) {
      window.location.replace("/overview");
    }
  }, [activeOrganizationId, session?.user?.activeOrganizationId]);

  useEffect(() => {
    function handleOrganizationChange(event: StorageEvent) {
      if (event.key === "workspace:active-organization") {
        window.location.replace("/overview");
      }
    }
    window.addEventListener("storage", handleOrganizationChange);
    return () => window.removeEventListener("storage", handleOrganizationChange);
  }, []);

  return (
    <div className="relative min-h-dvh bg-base md:flex">
      <Sidebar currentPath={pathname} workspaceName={organizationName} role={role} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col md:pl-16">
        <Topbar
          title={title}
          currentPath={pathname}
          workspaceName={organizationName}
          role={role}
          actions={
            <WorkspaceControls
              organizationName={organizationName}
              organizations={organizations}
              userName={userName}
            />
          }
        />
        <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function navigationTitle(pathname: string) {
  const path = pathname.split("/").filter(Boolean);
  if (path[0] === "members") return "People";
  if (path[0] === "projects" && path[1] === "new") return "New project";
  if (path[0] === "projects" && path[2] === "settings") return "Project settings";
  if (path[0] === "projects" && path[1]) return "Project details";
  const title = path[0] ?? "overview";
  return title.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
