"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, MailPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEMBER_ROLES } from "@/lib/constants";
import { inviteMemberSchema } from "@/lib/validations/member";

type InviteInput = z.input<typeof inviteMemberSchema>;
type InviteValues = z.output<typeof inviteMemberSchema>;

export function MemberInviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InviteInput, undefined, InviteValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "ENGINEER", title: "" },
  });

  async function submit(values: InviteValues) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/members/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Invitation couldn't be sent.");
        return;
      }
      setSuccess(`Invitation sent to ${result.data.email}.`);
      reset();
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="grid gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)_auto] sm:items-end" onSubmit={handleSubmit(submit)} noValidate>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Work email</span>
        <Input type="email" inputMode="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
        {errors.email && <span className="block text-xs text-error-dark">{errors.email.message}</span>}
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Role</span>
        <select defaultValue="ENGINEER" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("role")}>
          {MEMBER_ROLES.filter((role) => canInviteOwner || role !== "OWNER").map((role) => (
            <option key={role} value={role}>{role.charAt(0) + role.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Title <span className="text-text-muted">(optional)</span></span>
        <Input autoComplete="organization-title" {...register("title")} />
      </label>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <MailPlus aria-hidden="true" />}
        {isSubmitting ? "Sending..." : "Send invite"}
      </Button>
      {error && <p role="alert" className="text-sm text-error-dark sm:col-span-full">{error}</p>}
      {success && <p role="status" className="text-sm text-success-dark sm:col-span-full">{success}</p>}
    </form>
  );
}
