"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { organizationCreateSchema } from "@/lib/validations/organization";

type InputValues = z.input<typeof organizationCreateSchema>;

export function OrganizationForm() {
  const router = useRouter();
  const { update } = useSession();
  const [requestError, setRequestError] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InputValues>({
    resolver: zodResolver(organizationCreateSchema),
    defaultValues: { name: "", slug: "" },
  });

  async function submit(values: InputValues) {
    setRequestError("");
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setRequestError(result.error ?? "Organization could not be created.");
        return;
      }

      const session = await update({ activeOrganizationId: result.data.organizationId });
      if (session?.user.activeOrganizationId !== result.data.organizationId) {
        setRequestError("Organization was created, but we couldn't activate it. Sign out and back in to continue.");
        return;
      }
      router.replace("/overview");
      router.refresh();
    } catch {
      setRequestError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="space-y-2">
        <label htmlFor="organization-name" className="text-sm font-medium text-text-secondary">Organization name</label>
        <Input
          id="organization-name"
          autoComplete="organization"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "organization-name-error" : undefined}
          {...register("name", {
            onChange: (event) => {
              const slug = event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
              if (!errors.slug) setValue("slug", slug, { shouldValidate: true });
            },
          })}
        />
        {errors.name && <p id="organization-name-error" className="text-sm text-error-dark">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="organization-slug" className="text-sm font-medium text-text-secondary">Workspace URL</label>
        <Input
          id="organization-slug"
          autoComplete="off"
          aria-invalid={Boolean(errors.slug)}
          aria-describedby={errors.slug ? "organization-slug-error" : "organization-slug-help"}
          {...register("slug")}
        />
        {errors.slug ? (
          <p id="organization-slug-error" className="text-sm text-error-dark">{errors.slug.message}</p>
        ) : (
          <p id="organization-slug-help" className="text-xs text-text-muted">Lowercase letters, numbers, and hyphens.</p>
        )}
      </div>
      {requestError && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{requestError}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
        {isSubmitting ? "Creating..." : "Create organization"}
      </Button>
    </form>
  );
}
