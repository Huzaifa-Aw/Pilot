# 05 — Component Architecture

> React component hierarchy, layout shells, RBAC guards, and dynamic metadata cards.
> All components are domain-agnostic and driven by configuration.

---

## 1. Layout Shell

### `DashboardLayout` (Server Component)

```
(dashboard)/layout.tsx
  ├── <SessionProvider>           ← Auth.js session hydration
  ├── <OrgProvider>               ← Active org context (name, slug, logo, templates)
  ├── <ThemeProvider>             ← Dark/Light with system-preference detection
  └── <div class="flex h-screen">
        ├── <Sidebar />           ← Left navigation (collapsible)
        └── <main>
              ├── <Topbar />      ← Right-side: org switcher, avatar, notifications
              └── {children}      ← Page content slot
```

### `Sidebar.tsx`

```typescript
// src/components/layout/Sidebar.tsx
// RBAC-aware: nav items are shown/hidden based on session role

const NAV_ITEMS: NavItem[] = [
  { href: "/overview",     label: "Overview",     icon: LayoutDashboard, minRole: "VIEWER"   },
  { href: "/projects",     label: "Projects",     icon: FolderKanban,    minRole: "VIEWER"   },
  { href: "/members",      label: "Members",      icon: Users,           minRole: "VIEWER"   },
  { href: "/timesheets",   label: "Timesheets",   icon: Clock,           minRole: "ENGINEER" },
  { href: "/deployments",  label: "Deployments",  icon: MapPin,          minRole: "ENGINEER" },
  { href: "/assets",       label: "Assets",       icon: Package,         minRole: "VIEWER"   },
  { href: "/audit-log",    label: "Audit Log",    icon: ScrollText,      minRole: "ADMIN"    },
  { href: "/settings",     label: "Settings",     icon: Settings,        minRole: "ADMIN"    },
];

// Filter by role before rendering
const visibleItems = NAV_ITEMS.filter(item =>
  roleAtLeast(session.user.role, item.minRole)
);
```

---

## 2. Data Display Components

### `DataTable.tsx` — Universal Paginated Table

```typescript
// src/components/data-display/DataTable.tsx

interface DataTableProps<T> {
  columns: ColumnDef<T>[];          // TanStack Table column definitions
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSearch?: (query: string) => void;
  onSort?: (column: string, dir: "asc" | "desc") => void;
  isLoading?: boolean;
  emptyMessage?: string;
  actions?: React.ReactNode;        // Slot for "New Project" button etc.
}

// Usage example — Projects list
const columns: ColumnDef<Project>[] = [
  { accessorKey: "code",   header: "Code" },
  { accessorKey: "title",  header: "Title" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "milestones",
    header: "Progress",
    cell: ({ row }) => <MilestoneProgressBar milestones={row.original.milestones} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <ProjectRowActions project={row.original} />,
  },
];
```

---

### `MetadataCard.tsx` — Dynamic Domain Fields Renderer

The centerpiece of the domain-agnostic architecture. Reads a `MetadataTemplate`
and renders the correct input or display element for each field type.

```typescript
// src/components/data-display/MetadataCard.tsx

interface MetadataField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "multi-select" | "boolean" | "textarea";
  options?: string[];          // For select/multi-select
  required?: boolean;
  unit?: string;               // e.g. "kN/m²", "hrs", "%"
}

interface MetadataCardProps {
  template: MetadataField[];
  values: Record<string, unknown>;
  mode: "view" | "edit";
  onChange?: (key: string, value: unknown) => void;
}

export function MetadataCard({ template, values, mode, onChange }: MetadataCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {template.map((field) => (
          <MetadataField
            key={field.key}
            field={field}
            value={values[field.key]}
            mode={mode}
            onChange={onChange}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// MetadataField renders differently per type:
// "text"         → <Input />
// "number"       → <Input type="number" /> + unit suffix
// "select"       → <Select> with options[]
// "multi-select" → <MultiSelect> (custom component)
// "boolean"      → <Switch />
// "textarea"     → <Textarea />
// "date"         → <DatePicker />
```

---

### `StatusBadge.tsx` — Config-Driven Status Pills

```typescript
// src/components/data-display/StatusBadge.tsx
// Colors are derived from a lookup map, not hardcoded per status string

const STATUS_COLORS: Record<string, string> = {
  // Projects
  PLANNING:    "bg-slate-500/20   text-slate-400  border-slate-500/30",
  ACTIVE:      "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  ON_HOLD:     "bg-amber-500/20   text-amber-400   border-amber-500/30",
  COMPLETED:   "bg-blue-500/20    text-blue-400    border-blue-500/30",
  ARCHIVED:    "bg-zinc-500/20    text-zinc-400    border-zinc-500/30",
  // Tasks
  BACKLOG:     "bg-zinc-500/20    text-zinc-400    border-zinc-500/30",
  IN_PROGRESS: "bg-violet-500/20  text-violet-400  border-violet-500/30",
  UNDER_REVIEW:"bg-yellow-500/20  text-yellow-400  border-yellow-500/30",
  APPROVED:    "bg-teal-500/20    text-teal-400    border-teal-500/30",
  CANCELLED:   "bg-rose-500/20    text-rose-400    border-rose-500/30",
  // Timesheets
  DRAFT:       "bg-zinc-500/20    text-zinc-400    border-zinc-500/30",
  SUBMITTED:   "bg-sky-500/20     text-sky-400     border-sky-500/30",
  FLAGGED:     "bg-red-500/20     text-red-400     border-red-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_COLORS[status] ?? "bg-gray-500/20 text-gray-400";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
```

---

### `KpiCard.tsx` — Metric Summary Cards

```typescript
// src/components/data-display/KpiCard.tsx

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number;          // Positive = improvement, negative = decline
  deltaLabel?: string;     // e.g. "vs. last month"
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  sparklineData?: number[];
}
```

---

### `CapacityHeatmap.tsx` — Weekly Allocation Grid

Renders a 12-week rolling heatmap where each cell represents a member's
allocation percentage for that week. Color intensity = utilization level.

```
Member           W1   W2   W3   W4   W5   W6   W7   W8   ...
─────────────────────────────────────────────────────────────
Jane Doe         ██░  ███  ██░  ░░░  ███  ░░░  ██░  ███
John Smith       ░░░  ██░  ███  ███  ░░░  ██░  ░░░  ██░

Legend: ░░░ = 0–25%  ██░ = 25–75%  ███ = 75–100%  🔴 = >100% (overallocation)
```

Color scale:
- `0–24%`:    `bg-zinc-800` (empty)
- `25–49%`:   `bg-emerald-900`
- `50–74%`:   `bg-emerald-700`
- `75–99%`:   `bg-emerald-500`
- `100%`:     `bg-emerald-400 ring-2 ring-emerald-300`
- `>100%`:    `bg-red-500 ring-2 ring-red-400 animate-pulse`

---

## 3. Form Components

### `ProjectForm.tsx`

- Static fields: `code`, `title`, `description`, `status`, `startDate`, `endDate`, `budgetHours`, `tags`.
- Dynamic section: `<MetadataCard mode="edit" template={orgTemplate} />` rendered after static fields.
- Validation: Zod schema run client-side before submission.

### `MetadataTemplateBuilder.tsx`

Admin-only drag-and-drop field configurator. Uses `@dnd-kit/core` for reordering.

```
┌────────────────────────────────────────────────┐
│  Metadata Template: Structural Project Fields   │
├────────────────────────────────────────────────┤
│  ⠿  Stress Load Vectors    [number]  [unit: kN/m²]  [required ✓]  [🗑]  │
│  ⠿  Material Grade         [select]  [A36, A572, ...]              [🗑]  │
│  ⠿  Design Code            [select]  [AISC, ACI, EN]               [🗑]  │
│                                                                          │
│  [ + Add Field ]                    [ Save Template ]                    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. RBAC Guards

### `RBACGuard.tsx` (Client Component)

Wraps UI elements that should only render for certain roles.
**Important**: This is a UX convenience only — the server enforces authorization.

```typescript
// src/components/guards/RBACGuard.tsx

interface RBACGuardProps {
  minRole: MemberRole;
  fallback?: React.ReactNode;    // What to show if unauthorized (default: null)
  children: React.ReactNode;
}

export function RBACGuard({ minRole, fallback = null, children }: RBACGuardProps) {
  const { data: session } = useSession();
  const userRole = session?.user?.role as MemberRole;

  if (!roleAtLeast(userRole, minRole)) return <>{fallback}</>;
  return <>{children}</>;
}

// Usage
<RBACGuard minRole="MANAGER">
  <Button onClick={openCreateProjectDialog}>New Project</Button>
</RBACGuard>

<RBACGuard minRole="ADMIN" fallback={<p className="text-muted">Audit log restricted.</p>}>
  <AuditLogTable entries={auditEntries} />
</RBACGuard>
```

---

## 5. OrgProvider Context

Provides organization-level configuration to all child components without prop drilling.

```typescript
// src/providers/OrgProvider.tsx

interface OrgContextValue {
  orgId: string;
  orgName: string;
  orgSlug: string;
  logoUrl: string | null;
  timezone: string;
  locale: string;
  metadataTemplates: MetadataTemplate[];   // All templates for this org
  getTemplate: (entityType: string) => MetadataTemplate | undefined;
}

// Usage in any component:
const { orgName, getTemplate } = useOrg();
const projectTemplate = getTemplate("project");

<MetadataCard template={projectTemplate?.fields ?? []} values={project.metadata} mode="view" />
```

---

## 6. Page Layout Pattern

Every dashboard page follows this consistent shell:

```typescript
// Example: /projects page

export default async function ProjectsPage({ searchParams }) {
  const ctx = await resolveTenantContext();          // Server-side auth check
  const projects = await fetchProjects(ctx, searchParams);

  return (
    <PageShell
      title="Projects"
      description="Manage all engineering projects across your organization."
      actions={
        <RBACGuard minRole="MANAGER">
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Link>
          </Button>
        </RBACGuard>
      }
    >
      <DataTable
        columns={projectColumns}
        data={projects.data}
        total={projects.meta.total}
        page={projects.meta.page}
        pageSize={projects.meta.pageSize}
      />
    </PageShell>
  );
}
```

---

## 7. Theme & Design Tokens

```css
/* src/styles/globals.css */
:root {
  --background:        0 0% 100%;
  --foreground:        240 10% 3.9%;
  --card:              0 0% 100%;
  --primary:           240 5.9% 10%;
  --muted:             240 4.8% 95.9%;
  --accent:            240 4.8% 95.9%;
  --destructive:       0 84.2% 60.2%;
  --border:            240 5.9% 90%;
  --radius:            0.5rem;
}

.dark {
  --background:        240 10% 3.9%;
  --foreground:        0 0% 98%;
  --card:              240 10% 6%;
  --primary:           0 0% 98%;
  --muted:             240 3.7% 15.9%;
  --accent:            240 3.7% 15.9%;
  --destructive:       0 62.8% 30.6%;
  --border:            240 3.7% 15.9%;
}
```

---

*Next: [`06_MIGRATION_RUNBOOK.md`](./06_MIGRATION_RUNBOOK.md)*
