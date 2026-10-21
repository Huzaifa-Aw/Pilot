"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setupSchema } from "@/lib/validations/setup";

type SetupInput = z.input<typeof setupSchema>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function SetupForm() {
  const router = useRouter();
  const [requestError, setRequestError] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      organizationName: "",
      organizationSlug: "",
      ownerName: "",
      ownerEmail: "",
      password: "",
    },
  });

  async function submit(values: SetupInput) {
    setRequestError("");
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        setRequestError(result.error ?? "Setup could not be completed. Try again.");
        return;
      }
    } catch {
      setRequestError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    router.replace("/login?setup=complete");
    router.refresh();
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="space-y-2">
        <label htmlFor="organizationName" className="text-sm font-medium text-text-secondary">
          Organization name
        </label>
        <Input
          id="organizationName"
          autoComplete="organization"
          placeholder="Your organization"
          aria-invalid={Boolean(errors.organizationName)}
          aria-describedby={errors.organizationName ? "organizationName-error" : undefined}
          {...register("organizationName", {
            onChange: (event) => {
              if (!errors.organizationSlug) {
                setValue("organizationSlug", slugify(event.target.value), { shouldValidate: true });
              }
            },
          })}
        />
        {errors.organizationName && <p id="organizationName-error" className="text-sm text-error-dark">{errors.organizationName.message}</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="organizationSlug" className="text-sm font-medium text-text-secondary">
          Workspace URL
        </label>
        <div className="flex min-h-11 items-center overflow-hidden rounded-md border border-border-default bg-surface focus-within:border-brand-primary focus-within:ring-3 focus-within:ring-brand-primary/15">
          <span className="shrink-0 border-r border-border-default bg-neutral-50 px-3 py-3 text-sm text-text-muted">/</span>
          <input
            id="organizationSlug"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            aria-invalid={Boolean(errors.organizationSlug)}
            aria-describedby={errors.organizationSlug ? "organizationSlug-error" : "organizationSlug-help"}
            {...register("organizationSlug")}
          />
        </div>
        {errors.organizationSlug ? (
          <p id="organizationSlug-error" className="text-sm text-error-dark">{errors.organizationSlug.message}</p>
        ) : (
          <p id="organizationSlug-help" className="text-xs text-text-muted">Lowercase letters, numbers, and hyphens.</p>
        )}
      </div>
      <div className="border-t border-border-default pt-5">
        <h2 className="text-sm font-semibold text-text-primary">Owner account</h2>
        <p className="mt-1 text-xs text-text-muted">This account will have full control of the organization.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="ownerName" className="text-sm font-medium text-text-secondary">Full name</label>
        <Input
          id="ownerName"
          autoComplete="name"
          aria-invalid={Boolean(errors.ownerName)}
          aria-describedby={errors.ownerName ? "ownerName-error" : undefined}
          {...register("ownerName")}
        />
        {errors.ownerName && <p id="ownerName-error" className="text-sm text-error-dark">{errors.ownerName.message}</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="ownerEmail" className="text-sm font-medium text-text-secondary">Work email</label>
        <Input
          id="ownerEmail"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.ownerEmail)}
          aria-describedby={errors.ownerEmail ? "ownerEmail-error" : undefined}
          {...register("ownerEmail")}
        />
        {errors.ownerEmail && <p id="ownerEmail-error" className="text-sm text-error-dark">{errors.ownerEmail.message}</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text-secondary">Password</label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : "password-help"}
          {...register("password")}
        />
        {errors.password ? (
          <p id="password-error" className="text-sm text-error-dark">{errors.password.message}</p>
        ) : (
          <p id="password-help" className="text-xs text-text-muted">Use at least 12 characters.</p>
        )}
      </div>
      {requestError && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{requestError}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
        {isSubmitting ? "Creating workspace..." : "Create workspace"}
      </Button>
    </form>
  );
}
