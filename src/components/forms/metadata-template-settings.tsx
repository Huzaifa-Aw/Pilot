"use client";

import { useState } from "react";
import { MetadataTemplateBuilder } from "@/components/forms/metadata-template-builder";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";

type EntityType = "project" | "asset" | "member" | "milestone" | "task" | "deployment";
type Template = {
  id: string;
  name: string;
  entityType: EntityType;
  fields: MetadataFieldDefinition[];
  isDefault: boolean;
};

const entities: Array<{ type: EntityType; label: string; description: string }> = [
  { type: "project", label: "Projects", description: "Additional details shown on project forms and pages." },
  { type: "milestone", label: "Milestones", description: "Organization-specific checkpoint details." },
  { type: "task", label: "Tasks", description: "Additional details shown on task forms and project boards." },
  { type: "member", label: "Members", description: "Additional organization member profile fields." },
  { type: "asset", label: "Assets", description: "Details your organization tracks for its assets." },
  { type: "deployment", label: "Deployments", description: "Additional details for scheduled work." },
];

export function MetadataTemplateSettings({ templates }: { templates: Template[] }) {
  const [activeType, setActiveType] = useState<EntityType>("project");
  const activeEntity = entities.find(({ type }) => type === activeType)!;
  const activeTemplate = templates.find((template) => template.entityType === activeType && template.isDefault) ?? null;

  return (
    <div className="space-y-5">
      <div aria-label="Metadata entity type" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {entities.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            aria-pressed={activeType === type}
            onClick={() => setActiveType(type)}
            className={`min-h-11 rounded-md border px-3 text-sm font-semibold transition-colors duration-150 ${activeType === type ? "border-brand-primary bg-info-light text-info-dark" : "border-border-default bg-surface text-text-secondary hover:bg-neutral-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <section aria-labelledby="entity-description">
        <h2 id="entity-description" className="sr-only">{activeEntity.label} metadata</h2>
        <p className="mb-3 text-sm text-text-secondary">{activeEntity.description}</p>
        <MetadataTemplateBuilder
          key={activeType}
          entityType={activeType}
          initialTemplate={activeTemplate}
        />
      </section>
    </div>
  );
}
