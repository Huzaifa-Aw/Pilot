import {
  Activity,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Boxes,
  KanbanSquare,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { MemberRole } from "@prisma/client";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minRole: MemberRole;
}

export const navigationItems: NavigationItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, minRole: "VIEWER" },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness, minRole: "VIEWER" },
  { href: "/board", label: "Board", icon: KanbanSquare, minRole: "VIEWER" },
  { href: "/members", label: "People", icon: UsersRound, minRole: "VIEWER" },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, minRole: "ENGINEER" },
  { href: "/deployments", label: "Deployments", icon: CalendarClock, minRole: "ENGINEER" },
  { href: "/assets", label: "Assets", icon: Boxes, minRole: "VIEWER" },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, minRole: "MANAGER" },
  { href: "/settings", label: "Settings", icon: Settings, minRole: "ADMIN" },
];

export const workspaceIcon = Activity;
