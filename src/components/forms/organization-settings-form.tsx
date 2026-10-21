"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { organizationUpdateSchema } from "@/lib/validations/organization";

type OrganizationInput = z.input<typeof organizationUpdateSchema>;
type OrganizationValues = z.output<typeof organizationUpdateSchema>;

export function OrganizationSettingsForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: {
    name: string;
    slug: string;
    logoUrl: string | null;
    website: string | null;
    industry: string | null;
    timezone: string;
    locale: string;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationInput, undefined, OrganizationValues>({
    resolver: zodResolver(organizationUpdateSchema),
    defaultValues: {
      ...initial,
      logoUrl: initial.logoUrl ?? "",
      website: initial.website ?? "",
      industry: initial.industry ?? "",
    },
  });

  async function submit(values: OrganizationValues) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Organization settings couldn't be saved.");
        return;
      }
      setSuccess("Organization settings saved.");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" htmlFor="organization-name" error={errors.name?.message}>
          <Input id="organization-name" autoComplete="organization" {...register("name")} />
        </Field>
        <Field label="Organization URL" htmlFor="organization-slug" error={errors.slug?.message}>
          <Input id="organization-slug" {...register("slug")} />
        </Field>
        <Field label="Website" htmlFor="organization-website" error={errors.website?.message}>
          <Input id="organization-website" type="url" autoComplete="url" placeholder="https://" {...register("website")} />
        </Field>
        <Field label="Industry or discipline" htmlFor="organization-industry" error={errors.industry?.message}>
          <Input id="organization-industry" {...register("industry")} />
        </Field>
        <Field label="Logo URL" htmlFor="organization-logo" error={errors.logoUrl?.message}>
          <Input id="organization-logo" type="url" placeholder="https://" {...register("logoUrl")} />
        </Field>
        <Field label="Time zone" htmlFor="organization-timezone" error={errors.timezone?.message}>
          <Input id="organization-timezone" placeholder="UTC" {...register("timezone")} />
        </Field>
        <Field label="Locale" htmlFor="organization-locale" error={errors.locale?.message}>
          <Input id="organization-locale" placeholder="en" {...register("locale")} />
        </Field>
      </div>
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      {success && <p role="status" className="text-sm text-success-dark">{success}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        {isSubmitting ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">{label}</label>
      {children}
      {error && <p className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
