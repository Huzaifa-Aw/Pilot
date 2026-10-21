"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { MetadataFieldDefinition } from "@/lib/validations/metadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EntityType = "project" | "asset" | "member" | "milestone" | "task";
type Template = {
  id: string;
  name: string;
  entityType: EntityType;
  fields: MetadataFieldDefinition[];
  isDefault: boolean;
};
type EditableField = MetadataFieldDefinition & { clientId: string };

const types = ["text", "number", "date", "select", "multi-select", "boolean", "textarea"] as const;

export function MetadataTemplateBuilder({
  entityType,
  initialTemplate,
}: {
  entityType: EntityType;
  initialTemplate: Template | null;
}) {
  const [name, setName] = useState(initialTemplate?.name ?? defaultName(entityType));
  const [fields, setFields] = useState<EditableField[]>(() =>
    (initialTemplate?.fields ?? []).map((field) => ({ ...field, clientId: field.key })),
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((current) => {
      const oldIndex = current.findIndex((field) => field.clientId === active.id);
      const newIndex = current.findIndex((field) => field.clientId === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex).map((field, order) => ({ ...field, order }));
    });
  }

  function addField() {
    const key = `field_${Date.now()}`;
    setFields((current) => [...current, { clientId: `${key}_${current.length}`, key, label: "New field", type: "text", required: false, order: current.length }]);
    setSuccess("");
    setError("");
  }

  function updateField(clientId: string, update: Partial<MetadataFieldDefinition>) {
    setFields((current) => current.map((field) => field.clientId === clientId ? { ...field, ...update } : field));
    setSuccess("");
  }

  async function save() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const endpoint = initialTemplate
        ? `/api/metadata-templates/${initialTemplate.id}`
        : "/api/metadata-templates";
      const response = await fetch(endpoint, {
        method: initialTemplate ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType,
          name,
          fields: fields.map((field, order) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            options: field.options,
            required: field.required,
            order,
            unit: field.unit,
          })),
          isDefault: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Template couldn't be saved.");
        return;
      }
      setSuccess("Default template saved.");
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface">
      <div className="space-y-3 border-b border-border-default px-4 py-4 sm:flex sm:items-end sm:justify-between sm:space-y-0 sm:px-5">
        <label className="block min-w-0 flex-1 space-y-1.5">
          <span className="text-sm font-medium text-text-secondary">Template name</span>
          <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="text-xs text-text-muted">Default for {entityType}s</p>
      </div>
      <div className="space-y-3 p-3 sm:p-5">
        {fields.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((field) => field.clientId)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {fields.map((field) => (
                  <SortableMetadataField
                    key={field.clientId}
                    field={field}
                    onChange={(update) => updateField(field.clientId, update)}
                    onRemove={() => setFields((current) => current.filter((item) => item.clientId !== field.clientId).map((item, order) => ({ ...item, order })))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-text-muted">
            No custom fields yet. Add the fields your organization needs.
          </p>
        )}
        <Button type="button" variant="secondary" onClick={addField}>
          <Plus aria-hidden="true" /> Add field
        </Button>
      </div>
      <div className="flex flex-col gap-3 border-t border-border-default px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-h-5">
          {error && <p role="alert" className="text-sm text-error-dark">{error}</p>}
          {success && <p role="status" className="text-sm text-success-dark">{success}</p>}
        </div>
        <Button type="button" disabled={saving || !name.trim()} onClick={() => void save()}>
          {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {saving ? "Saving..." : "Save template"}
        </Button>
      </div>
    </section>
  );
}

function SortableMetadataField({
  field,
  onChange,
  onRemove,
}: {
  field: EditableField;
  onChange: (update: Partial<MetadataFieldDefinition>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.clientId });

  return (
    <li
      ref={setNodeRef}
      className={`rounded-lg border border-border-default bg-surface p-3 sm:p-4 ${isDragging ? "z-10 shadow-lg" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
        <button
          type="button"
          aria-label={`Reorder ${field.label}`}
          className="inline-flex size-11 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-border-focus"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Field label</span>
            <Input value={field.label} onChange={(event) => onChange({ label: event.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Field key</span>
            <Input value={field.key} onChange={(event) => onChange({ key: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Type</span>
            <select
              value={field.type}
              onChange={(event) => {
                const type = types.find((item) => item === event.target.value);
                if (type) onChange({ type });
              }}
              className="min-h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm"
            >
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          {(field.type === "select" || field.type === "multi-select") && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-secondary">Options (comma-separated)</span>
              <Input value={(field.options ?? []).join(", ")} onChange={(event) => onChange({ options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} />
            </label>
          )}
          {field.type === "number" && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-secondary">Unit (optional)</span>
              <Input value={field.unit ?? ""} onChange={(event) => onChange({ unit: event.target.value })} />
            </label>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" className="size-4 accent-brand-primary" checked={field.required ?? false} onChange={(event) => onChange({ required: event.target.checked })} />
            Required
          </label>
        </div>
        <div className="flex items-end sm:col-start-3 sm:row-start-1">
          <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${field.label}`} onClick={onRemove}>
            <Trash2 aria-hidden="true" className="text-error-dark" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function defaultName(entityType: EntityType) {
  return `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)} fields`;
}
