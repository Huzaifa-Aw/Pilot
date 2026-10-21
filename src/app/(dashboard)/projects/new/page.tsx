import type { Metadata } from "next";
import { ProjectForm } from "@/components/forms/project-form";
import { BackLink } from "@/components/layout/BackLink";
import { getDefaultMetadataFields } from "@/lib/metadata";
import { resolveTenantContext } from "@/lib/tenant";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Create project" };

export default async function NewProjectPage() {
  const context = await resolveTenantContext();
  if (!context) redirect("/login");
  const metadataFields = await getDefaultMetadataFields(context.organizationId, "project");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/projects" label="Projects" currentPage="New project" />
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Project setup</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Create a project</h1>
        <p className="mt-2 text-sm text-text-secondary">Start with a name, a clear reference code, and the details your team needs.</p>
      </header>
      <section className="rounded-lg border border-border-default bg-surface p-4 shadow-sm sm:p-6">
        <ProjectForm metadataFields={metadataFields} />
      </section>
    </div>
  );
}
