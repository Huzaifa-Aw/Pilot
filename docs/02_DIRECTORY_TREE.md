# 02 — Directory Tree Blueprint

> Complete annotated folder/file structure for the white-label SaaS platform.
> Replaces the current domain-specific app structure.

---

## Root Layout

```
/
├── prisma/
│   ├── schema.prisma           # Generic multi-tenant schema (see 03_PRISMA_SCHEMA.md)
│   ├── migrations/             # Prisma migration history (auto-generated)
│   └── seed.ts                 # Seed: demo org, sample projects, RBAC roles
│
├── public/
│   ├── logo.svg                # White-label placeholder logo (swapped per org at runtime)
│   └── icons/                  # Generic UI icons
│
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/             # Reusable React components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities, DB client, auth, middleware
│   ├── types/                  # Global TypeScript type definitions
│   └── styles/                 # Global CSS + design tokens
│
├── Migration_SaaS/             # ← THIS FOLDER (migration docs)
│   ├── 00_INDEX.md
│   ├── 01_ARCHITECTURE_OVERVIEW.md
│   ├── 02_DIRECTORY_TREE.md
│   ├── 03_PRISMA_SCHEMA.md
│   ├── 04_API_ROUTES.md
│   ├── 05_COMPONENT_ARCHITECTURE.md
│   ├── 06_MIGRATION_RUNBOOK.md
│   └── 07_ENVIRONMENT_AND_DEPLOYMENT.md
│
├── .env.local                  # Local secrets (never committed)
├── .env.example                # Template for all required env vars
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## `/src/app/` — Next.js App Router

```
src/app/
│
├── (auth)/                         # Auth group — unauthenticated routes
│   ├── login/
│   │   └── page.tsx                # Login form (email/password + OAuth)
│   ├── register/
│   │   └── page.tsx                # Self-registration (gated by ALLOW_PUBLIC_SIGNUP)
│   ├── invite/[token]/
│   │   └── page.tsx                # Accept org invitation
│   └── layout.tsx                  # Auth shell (centered card layout)
│
├── (dashboard)/                    # Protected group — requires valid session
│   ├── layout.tsx                  # Root dashboard layout (sidebar + topbar)
│   │
│   ├── overview/
│   │   └── page.tsx                # Org-level KPI dashboard (cards + charts)
│   │
│   ├── projects/
│   │   ├── page.tsx                # Project list (filterable, sortable, paginated)
│   │   ├── new/
│   │   │   └── page.tsx            # Create project form
│   │   └── [projectId]/
│   │       ├── page.tsx            # Project detail (overview + milestones + tasks)
│   │       ├── milestones/
│   │       │   └── page.tsx        # Milestone management
│   │       ├── tasks/
│   │       │   └── page.tsx        # Task board (Kanban/table toggle)
│   │       ├── allocations/
│   │       │   └── page.tsx        # Resource allocation for this project
│   │       └── settings/
│   │           └── page.tsx        # Project metadata + configuration
│   │
│   ├── members/
│   │   ├── page.tsx                # Member directory (all org members)
│   │   └── [memberId]/
│   │       └── page.tsx            # Member profile + allocation history
│   │
│   ├── timesheets/
│   │   ├── page.tsx                # Timesheet list (admin: all members; engineer: own)
│   │   └── [timesheetId]/
│   │       └── page.tsx            # Weekly timesheet entry form
│   │
│   ├── deployments/
│   │   ├── page.tsx                # Site deployment / travel schedule overview
│   │   └── [deploymentId]/
│   │       └── page.tsx            # Deployment detail + checklist
│   │
│   ├── assets/
│   │   ├── page.tsx                # Generic asset registry (instruments, docs, equipment)
│   │   └── [assetId]/
│   │       └── page.tsx            # Asset detail + metadata card
│   │
│   ├── audit-log/
│   │   └── page.tsx                # Immutable audit trail (admin only)
│   │
│   └── settings/
│       ├── page.tsx                # Org settings root
│       ├── general/
│       │   └── page.tsx            # Org name, logo, slug
│       ├── members/
│       │   └── page.tsx            # Invite members, manage roles
│       ├── metadata-templates/
│       │   └── page.tsx            # Configure dynamic metadata fields per entity
│       └── integrations/
│           └── page.tsx            # Webhook, API key management
│
├── api/
│   ├── auth/[...nextauth]/
│   │   └── route.ts                # Auth.js catch-all route
│   │
│   ├── orgs/
│   │   └── route.ts                # POST /api/orgs — create new organization
│   │
│   ├── projects/
│   │   ├── route.ts                # GET (list) · POST (create)
│   │   └── [projectId]/
│   │       ├── route.ts            # GET · PATCH · DELETE
│   │       ├── milestones/
│   │       │   └── route.ts
│   │       ├── tasks/
│   │       │   └── route.ts
│   │       └── allocations/
│   │           └── route.ts
│   │
│   ├── members/
│   │   ├── route.ts                # GET list · POST invite
│   │   └── [memberId]/
│   │       └── route.ts            # GET · PATCH · DELETE
│   │
│   ├── timesheets/
│   │   ├── route.ts
│   │   └── [timesheetId]/
│   │       └── route.ts
│   │
│   ├── deployments/
│   │   ├── route.ts
│   │   └── [deploymentId]/
│   │       └── route.ts
│   │
│   ├── assets/
│   │   ├── route.ts
│   │   └── [assetId]/
│   │       └── route.ts
│   │
│   ├── audit-log/
│   │   └── route.ts                # GET only (append-only, no mutations)
│   │
│   └── metadata-templates/
│       ├── route.ts
│       └── [templateId]/
│           └── route.ts
│
├── globals.css
└── layout.tsx                      # Root HTML shell (fonts, providers, theme)
```

---

## `/src/components/` — React Components

```
src/components/
│
├── layout/
│   ├── Sidebar.tsx                 # Collapsible sidebar with RBAC-aware nav items
│   ├── Topbar.tsx                  # Org switcher, user menu, notifications bell
│   ├── MobileNav.tsx               # Responsive bottom-sheet navigation
│   └── PageShell.tsx               # Consistent page wrapper (title + breadcrumbs + actions)
│
├── ui/                             # shadcn/ui components (auto-generated, do not edit)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table.tsx
│   ├── badge.tsx
│   ├── tabs.tsx
│   ├── toast.tsx
│   └── ...
│
├── data-display/
│   ├── DataTable.tsx               # Generic, sortable, filterable, paginated table
│   ├── KpiCard.tsx                 # Metric card (value + delta + sparkline)
│   ├── StatusBadge.tsx             # Color-coded status pill (config-driven)
│   ├── MetadataCard.tsx            # Dynamic JSON metadata renderer
│   ├── TimelineView.tsx            # Milestone / Gantt-style progress timeline
│   └── CapacityHeatmap.tsx         # Weekly resource allocation heatmap grid
│
├── forms/
│   ├── ProjectForm.tsx             # Create/edit project (+ dynamic metadata fields)
│   ├── MilestoneForm.tsx           # Create/edit milestone
│   ├── TaskForm.tsx                # Create/edit task
│   ├── MemberForm.tsx              # Invite/edit member + role selector
│   ├── TimesheetForm.tsx           # Weekly time entry grid
│   ├── DeploymentForm.tsx          # Site deployment + date range
│   ├── AssetForm.tsx               # Generic asset registration
│   └── MetadataTemplateBuilder.tsx # Drag-and-drop field configurator for admins
│
├── charts/
│   ├── UtilizationChart.tsx        # Member capacity utilization (bar/area)
│   ├── BurndownChart.tsx           # Project hour burndown
│   ├── MilestoneProgressChart.tsx  # Donut / progress ring per milestone
│   └── AllocationHeatmap.tsx       # Calendar-based allocation density
│
├── guards/
│   ├── RBACGuard.tsx               # Client-side role gate (hides UI, server enforces)
│   └── TenantGuard.tsx             # Ensures organizationId in session before render
│
└── providers/
    ├── SessionProvider.tsx         # Auth.js session wrapper
    ├── ThemeProvider.tsx           # Dark/light theme context
    ├── OrgProvider.tsx             # Active org context (slug, name, logo, metadata templates)
    └── ToastProvider.tsx           # Global notification system
```

---

## `/src/lib/` — Core Utilities

```
src/lib/
├── db.ts                           # Singleton Prisma client
├── auth.ts                         # Auth.js config (providers, callbacks, JWT)
├── tenant.ts                       # withTenantContext() — injects orgId into queries
├── rbac.ts                         # requireRole(), hasPermission() helpers
├── validations/
│   ├── project.ts                  # Zod schemas for project CRUD
│   ├── member.ts                   # Zod schemas for member + invite
│   ├── milestone.ts
│   ├── task.ts
│   ├── timesheet.ts
│   ├── deployment.ts
│   └── asset.ts
├── audit.ts                        # createAuditEvent() — append to AuditLog
├── metadata.ts                     # parseMetadata(), validateMetadataAgainstTemplate()
├── utils.ts                        # cn(), slugify(), formatCurrency(), formatDate()
└── constants.ts                    # STATUS_MAP, ROLE_HIERARCHY, WORKFLOW_STATES
```

### Implemented V3 additions

- `src/app/(dashboard)/settings/workflows/page.tsx` and
  `src/components/forms/task-workflow-settings.tsx`: visual workflow/status configuration.
- `src/components/data-display/compact-filters.tsx`,
  `src/components/data-display/task-board-filters.tsx`,
  `src/components/data-display/task-board.tsx`, and
  `src/components/data-display/task-label-badge.tsx`: shared compact filters, the
  immediate-apply task filter panel, horizontal board/list view, and task labels.
- `src/components/forms/csv-import-panel.tsx`: shared template download, preview, and
  confirm interface. Import handlers are colocated under
  `src/app/api/{assets,projects,members,tasks,deployments,allocations,worklogs}/import/`.
- `src/lib/{allocation-planning,audit,csv,csv-templates,filter-params,metadata-csv,task-filters,task-workflows}.ts`:
  shared helpers for the corresponding workflows.

---

## `/src/types/` — TypeScript Definitions

```
src/types/
├── index.ts                        # Re-exports all types
├── auth.ts                         # Session, JWT, User types
├── org.ts                          # Organization, OrganizationMember
├── project.ts                      # Project, Milestone, Task, Allocation
├── member.ts                       # Member profile, skills, capacity
├── timesheet.ts                    # TimesheetEntry, WeeklyGrid
├── deployment.ts                   # Deployment, SiteChecklist
├── asset.ts                        # Asset, AssetTag
├── metadata.ts                     # MetadataTemplate, MetadataField, MetadataValue
└── api.ts                          # Generic ApiResponse<T>, PaginatedResponse<T>
```

---

*Next: [`03_PRISMA_SCHEMA.md`](./03_PRISMA_SCHEMA.md)*
