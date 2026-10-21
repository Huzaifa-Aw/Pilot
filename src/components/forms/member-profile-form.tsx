"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import type { MetadataInputValues } from "@/types/metadata";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEMBER_ROLES } from "@/lib/constants";
import { memberUpdateSchema } from "@/lib/validations/member";

type MemberInput = z.input<typeof memberUpdateSchema>;
type MemberValues = z.output<typeof memberUpdateSchema>;

export function MemberProfileForm({
  member,
  canEditRole,
  reportsToOptions,
  metadataFields = [],
  initialMetadata = {},
}: {
  member: {
    id: string;
    role: MemberValues["role"];
    title: string | null;
    discipline: string | null;
    department: string | null;
    phone: string | null;
    location: string | null;
    capacityHrsPerWeek: number;
    user: { name: string | null };
    bio: string | null;
    employmentType: string | null;
    startDate: Date | null;
    timezone: string;
    workingDays: number[];
    dailyCapacityHrs: number;
    languages: string[];
    preferredWorkMode: string | null;
    reportsToMemberId: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    skillsProfile: Array<{ name: string; level: number; yearsExperience: number | null }>;
    certifications: Array<{ name: string; issuer: string | null; issuedOn: Date | null; expiresOn: Date | null; credentialId: string | null }>;
  };
    canEditRole: boolean;
    reportsToOptions: Array<{ id: string; name: string }>;
  metadataFields?: MetadataFieldDefinition[];
  initialMetadata?: MetadataInputValues;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [metadata, setMetadata] = useState<MetadataInputValues>(initialMetadata);
  const [metadataChanged, setMetadataChanged] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MemberInput, undefined, MemberValues>({
    resolver: zodResolver(memberUpdateSchema),
    defaultValues: {
      role: canEditRole ? member.role : undefined,
      title: member.title ?? "",
      discipline: member.discipline ?? "",
      department: member.department ?? "",
      phone: member.phone ?? "",
      location: member.location ?? "",
      bio: member.bio ?? "",
      employmentType: member.employmentType as MemberValues["employmentType"],
      startDate: member.startDate?.toISOString().slice(0, 10) ?? "",
      timezone: member.timezone,
      workingDays: member.workingDays,
      dailyCapacityHrs: member.dailyCapacityHrs,
      languages: member.languages.join(", "),
      preferredWorkMode: member.preferredWorkMode as MemberValues["preferredWorkMode"],
      reportsToMemberId: member.reportsToMemberId,
      emergencyContactName: member.emergencyContactName ?? "",
      emergencyContactPhone: member.emergencyContactPhone ?? "",
      skills: member.skillsProfile.map(({ name, level, yearsExperience }) => ({ name, level, yearsExperience })),
      certifications: member.certifications.map(({ name, issuer, issuedOn, expiresOn, credentialId }) => ({
        name,
        issuer: issuer ?? "",
        issuedOn: issuedOn?.toISOString().slice(0, 10) ?? "",
        expiresOn: expiresOn?.toISOString().slice(0, 10) ?? "",
        credentialId: credentialId ?? "",
      })),
      capacityHrsPerWeek: member.capacityHrsPerWeek,
    },
  });
  const skills = useFieldArray({ control, name: "skills" });
  const certifications = useFieldArray({ control, name: "certifications" });
  const workingDays = useWatch({ control, name: "workingDays" }) ?? [];

  async function submit(values: MemberValues) {
    setError("");
    setSuccess("");
    const profileValues = {
      title: values.title,
      discipline: values.discipline,
      department: values.department,
      phone: values.phone,
      location: values.location,
      bio: values.bio,
      employmentType: values.employmentType,
      startDate: values.startDate,
      timezone: values.timezone,
      workingDays: values.workingDays,
      dailyCapacityHrs: values.dailyCapacityHrs,
      languages: values.languages,
      preferredWorkMode: values.preferredWorkMode,
      skills: values.skills,
      certifications: values.certifications,
      capacityHrsPerWeek: values.capacityHrsPerWeek,
      ...(metadataFields.length && metadataChanged ? { metadata } : {}),
    };
    try {
      const response = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(canEditRole
          ? { ...values, ...(metadataFields.length && metadataChanged ? { metadata } : {}) }
          : profileValues),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Member profile couldn't be updated.");
        return;
      }
      setSuccess("Member profile updated.");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor="title" error={errors.title?.message}><Input id="title" {...register("title")} /></Field>
        <Field label="Discipline" htmlFor="discipline" error={errors.discipline?.message}><Input id="discipline" {...register("discipline")} /></Field>
        <Field label="Department" htmlFor="department" error={errors.department?.message}><Input id="department" {...register("department")} /></Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}><Input id="phone" type="tel" autoComplete="tel" {...register("phone")} /></Field>
        <Field label="Location" htmlFor="location" error={errors.location?.message}><Input id="location" autoComplete="address-level2" {...register("location")} /></Field>
        <Field label="Employment type" htmlFor="employmentType" error={errors.employmentType?.message}>
          <select id="employmentType" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("employmentType")}>
            <option value="">Not set</option><option value="EMPLOYEE">Employee</option><option value="CONTRACTOR">Contractor</option><option value="INTERN">Intern</option><option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message}><Input id="startDate" type="date" {...register("startDate")} /></Field>
        <Field label="Time zone" htmlFor="timezone" error={errors.timezone?.message}><Input id="timezone" placeholder="UTC" {...register("timezone")} /></Field>
        <Field label="Daily capacity (hours)" htmlFor="dailyCapacityHrs" error={errors.dailyCapacityHrs?.message}><Input id="dailyCapacityHrs" type="number" min="0.25" max="24" step="0.25" {...register("dailyCapacityHrs", { valueAsNumber: true })} /></Field>
        <Field label="Languages (comma separated)" htmlFor="languages" error={errors.languages?.message}><Input id="languages" placeholder="English, Spanish" {...register("languages")} /></Field>
        <Field label="Preferred work mode" htmlFor="preferredWorkMode" error={errors.preferredWorkMode?.message}>
          <select id="preferredWorkMode" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("preferredWorkMode")}>
            <option value="">Not set</option><option value="REMOTE">Remote</option><option value="ON_SITE">On-site</option><option value="HYBRID">Hybrid</option><option value="FLEXIBLE">Flexible</option>
          </select>
        </Field>
        <Field label="Weekly capacity (hours)" htmlFor="capacityHrsPerWeek" error={errors.capacityHrsPerWeek?.message}>
          <Input
            id="capacityHrsPerWeek"
            type="number"
            min="0"
            max="168"
            step="0.5"
            {...register("capacityHrsPerWeek", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Bio" htmlFor="bio" error={errors.bio?.message}>
          <textarea id="bio" rows={3} maxLength={3000} className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm" {...register("bio")} />
        </Field>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium text-text-secondary">Working days</legend>
          <div className="flex flex-wrap gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, value) => (
              <label key={day} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-default px-3 text-sm">
                <input type="checkbox" checked={workingDays.includes(value)} onChange={(event) => setValue("workingDays", event.target.checked ? [...workingDays, value].sort() : workingDays.filter((item) => item !== value), { shouldValidate: true })} className="size-4 accent-brand-primary" />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        {canEditRole && (
          <>
            <Field label="Reports to" htmlFor="reportsToMemberId" error={errors.reportsToMemberId?.message}>
              <select id="reportsToMemberId" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("reportsToMemberId")}>
                <option value="">No manager</option>
                {reportsToOptions.filter(({ id }) => id !== member.id).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </Field>
            <Field label="Emergency contact name (admin only)" htmlFor="emergencyContactName" error={errors.emergencyContactName?.message}><Input id="emergencyContactName" {...register("emergencyContactName")} /></Field>
            <Field label="Emergency contact phone (admin only)" htmlFor="emergencyContactPhone" error={errors.emergencyContactPhone?.message}><Input id="emergencyContactPhone" type="tel" {...register("emergencyContactPhone")} /></Field>
          </>
        )}
        {canEditRole && (
          <Field label="Organization role" htmlFor="role" error={errors.role?.message}>
            <select id="role" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("role")}>
              {MEMBER_ROLES.map((role) => <option key={role} value={role}>{role.charAt(0) + role.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
        )}
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-text-primary">Skills</h3><p className="text-xs text-text-muted">Add skills and self-assessed proficiency (1–5).</p></div><button type="button" onClick={() => skills.append({ name: "", level: 3, yearsExperience: null })} className="min-h-11 rounded-md border border-border-default px-3 text-xs font-semibold text-brand-primary">Add skill</button></div>
        {skills.fields.map((field, index) => <div key={field.id} className="grid gap-2 rounded-md border border-border-default p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
          <Input aria-label="Skill name" placeholder="Skill name" {...register(`skills.${index}.name`)} />
          <label className="space-y-1"><span className="text-xs text-text-muted">Level (1–5)</span><Input type="number" min="1" max="5" {...register(`skills.${index}.level`, { valueAsNumber: true })} /></label>
          <label className="space-y-1"><span className="text-xs text-text-muted">Years</span><Input type="number" min="0" max="80" step="0.5" {...register(`skills.${index}.yearsExperience`, { setValueAs: (value) => value === "" ? null : Number(value) })} /></label>
          <button type="button" onClick={() => skills.remove(index)} className="min-h-11 rounded-md border border-error-light px-3 text-xs font-semibold text-error-dark">Remove</button>
        </div>)}
      </section>
      <section className="space-y-3 border-t border-border-default pt-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-text-primary">Certifications</h3><p className="text-xs text-text-muted">Track issuer and expiration to flag renewals.</p></div><button type="button" onClick={() => certifications.append({ name: "", issuer: "", issuedOn: "", expiresOn: "", credentialId: "" })} className="min-h-11 rounded-md border border-border-default px-3 text-xs font-semibold text-brand-primary">Add certification</button></div>
        {certifications.fields.map((field, index) => <div key={field.id} className="grid gap-2 rounded-md border border-border-default p-3 sm:grid-cols-2">
          <Input aria-label="Certification name" placeholder="Certification" {...register(`certifications.${index}.name`)} />
          <Input aria-label="Certification issuer" placeholder="Issuer" {...register(`certifications.${index}.issuer`)} />
          <label className="space-y-1"><span className="text-xs text-text-muted">Issued</span><Input type="date" {...register(`certifications.${index}.issuedOn`)} /></label>
          <label className="space-y-1"><span className="text-xs text-text-muted">Expires</span><Input type="date" {...register(`certifications.${index}.expiresOn`)} /></label>
          <Input aria-label="Credential ID" placeholder="Credential ID (optional)" {...register(`certifications.${index}.credentialId`)} />
          <button type="button" onClick={() => certifications.remove(index)} className="min-h-11 rounded-md border border-error-light px-3 text-xs font-semibold text-error-dark">Remove certification</button>
        </div>)}
      </section>
      <MetadataFieldsEditor
        fields={metadataFields}
        values={metadata}
        onChange={(key, value) => {
          setMetadataChanged(true);
          setMetadata((current) => ({ ...current, [key]: value }));
        }}
      />
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      {success && <p role="status" className="text-sm text-success-dark">{success}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        {isSubmitting ? "Saving..." : "Save profile"}
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
      {error && <p id={`${htmlFor}-error`} className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
