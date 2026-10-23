import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, KeyRound, ScrollText, UsersRound, Workflow } from "lucide-react";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { resolveTenantContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const context = await resolveTenantContext();
  if (!context) return null;
  if (!roleAtLeast(context.role, "ADMIN")) {
    return (
      <div className="rounded-lg border border-border-default bg-surface p-5">
        <h1 className="font-heading text-xl font-semibold text-text-primary">Settings are restricted</h1>
        <p className="mt-2 text-sm text-text-secondary">Ask an organization administrator to make changes.</p>
      </div>
    );
  }

  const organization = await db.organization.findUnique({
    where: { id: context.organizationId },
    select: { name: true, slug: true },
  });
  const sections = [
    { href: "/settings/general", icon: Building2, title: "Organization profile", description: "Name, URL, branding, time zone, and locale." },
    { href: "/settings/members", icon: UsersRound, title: "Member access", description: "Invitations, membership roles, and account access." },
    { href: "/settings/metadata-templates", icon: KeyRound, title: "Custom fields", description: "Organization-defined fields for projects, milestones, members, and assets." },
    { href: "/settings/workflows", icon: Workflow, title: "Workflows and labels", description: "Configure task statuses, transitions, required fields, and reusable labels." },
    { href: "/audit-log", icon: ScrollText, title: "Audit history", description: "Review recorded activity in this organization." },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Administration</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Settings</h1>
        <p className="mt-2 text-sm text-text-secondary">{organization?.name} · {organization?.slug}</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ href, icon: Icon, title, description }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-32 items-start gap-3 rounded-lg border border-border-default bg-surface p-4 transition-colors duration-150 hover:bg-neutral-50 sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-info-light text-brand-primary">
                <Icon size={19} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">{title}</span>
                  <ArrowRight size={15} className="text-brand-primary" aria-hidden="true" />
                </span>
                <span className="mt-2 block text-sm leading-5 text-text-muted">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
