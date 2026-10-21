"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MetadataFieldsEditor } from "@/components/forms/metadata-fields-editor";
import type { MetadataInputValues } from "@/types/metadata";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assetCreateSchema } from "@/lib/validations/asset";

type AssetInput = z.input<typeof assetCreateSchema>;
type AssetValues = z.output<typeof assetCreateSchema>;

export type EditableAsset = {
  id: string;
  assetCode: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  location: string | null;
  serialNumber: string | null;
  acquiredOn: Date | null;
  nextServiceDate: Date | null;
};

export function AssetForm({
  asset,
  initialCategory = "",
  metadataFields = [],
  initialMetadata = {},
}: {
  asset?: EditableAsset;
  initialCategory?: string;
  metadataFields?: MetadataFieldDefinition[];
  initialMetadata?: MetadataInputValues;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<MetadataInputValues>(initialMetadata);
  const [metadataChanged, setMetadataChanged] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssetInput, undefined, AssetValues>({
    resolver: zodResolver(assetCreateSchema),
    defaultValues: {
      assetCode: asset?.assetCode ?? "",
      title: asset?.title ?? "",
      description: asset?.description ?? "",
      category: asset?.category ?? initialCategory,
      location: asset?.location ?? "",
      serialNumber: asset?.serialNumber ?? "",
      acquiredOn: asset?.acquiredOn?.toISOString().slice(0, 10) ?? "",
      nextServiceDate: asset?.nextServiceDate?.toISOString().slice(0, 10) ?? "",
      status: asset?.status ?? "ACTIVE",
    },
  });

  async function submit(values: AssetValues) {
    setError("");
    try {
      const response = await fetch(asset ? `/api/assets/${asset.id}` : "/api/assets", {
        method: asset ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(metadataFields.length && (!asset || metadataChanged) ? { metadata } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Asset couldn't be saved.");
        return;
      }
      if (asset) router.push(`/assets/${asset.id}`);
      else router.push(`/assets/${result.data.id}`);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asset code" htmlFor="assetCode" error={errors.assetCode?.message}><Input id="assetCode" autoComplete="off" {...register("assetCode")} /></Field>
        <Field label="Asset name" htmlFor="title" error={errors.title?.message}><Input id="title" {...register("title")} /></Field>
        <Field label="Category" htmlFor="category" error={errors.category?.message}><Input id="category" placeholder="Equipment, document, resource" {...register("category")} /></Field>
        <Field label="Location" htmlFor="location" error={errors.location?.message}><Input id="location" placeholder="Office, site, or storage area" {...register("location")} /></Field>
        <Field label="Serial number" htmlFor="serialNumber" error={errors.serialNumber?.message}><Input id="serialNumber" {...register("serialNumber")} /></Field>
        <Field label="Acquired on" htmlFor="acquiredOn" error={errors.acquiredOn?.message}><Input id="acquiredOn" type="date" {...register("acquiredOn")} /></Field>
        <Field label="Next service date" htmlFor="nextServiceDate" error={errors.nextServiceDate?.message}><Input id="nextServiceDate" type="date" {...register("nextServiceDate")} /></Field>
        <Field label="Status" htmlFor="status" error={errors.status?.message}>
          <select id="status" className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm" {...register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="RETIRED">Retired</option>
          </select>
        </Field>
        <Field label="Description" htmlFor="description" error={errors.description?.message} wide>
          <textarea id="description" rows={3} className="w-full rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm" {...register("description")} />
        </Field>
      </div>
      <MetadataFieldsEditor
        fields={metadataFields}
        values={metadata}
        onChange={(key, value) => {
          setMetadataChanged(true);
          setMetadata((current) => ({ ...current, [key]: value }));
        }}
      />
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        {isSubmitting ? "Saving..." : asset ? "Save asset" : "Create asset"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
  wide = false,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-2 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">{label}</label>
      {children}
      {error && <p className="text-xs text-error-dark">{error}</p>}
    </div>
  );
}
