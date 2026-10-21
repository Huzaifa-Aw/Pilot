# AGENTS.md — White-Label Engineering Management SaaS Platform

> **Scope**: This file governs all AI agent behavior, code generation rules, and development
> standards for the generic, multi-tenant B2B SaaS platform defined in this `docs/`
> blueprint. It supersedes any domain-specific agent instructions from the original codebase.

---

## 1. Platform Identity & Context

This repository is being pivoted into a **white-label, domain-agnostic engineering management
platform** deployable as:

- A **multi-tenant cloud SaaS** for engineering firms of any discipline
- A **self-hosted internal workspace** for individual organizations

**Supported engineering domains** (non-exhaustive):
Civil · Structural · Mechanical · Electrical · Aerospace · Chemical · Software · Environmental · Marine

The platform provides: resource capacity planning, project & milestone tracking, timesheet
capture, site deployment management, asset registries, RBAC-governed access, and
customizable domain metadata — all without any discipline-specific assumptions baked in.

---

## 2. Absolute Naming Constraints

Agents MUST enforce these naming rules on every file, component, API route, schema model,
UI label, comment, and commit message:

### ❌ Never use (domain-specific / branded)
- Company names, client names, or any proper nouns tied to a specific organization
- `Engineer` as a model name (use `Member` or `OrganizationMember`)
- `feedstockType`, `plantCapacity`, `technologyLicensed`, `felStageGate`
- `ISATag`, `pAndIdNumber`, `designPressure`, `metallurgy`
- `TravelDeployment` (use `Deployment`)
- `InvoiceMilestone` (use `Milestone` + `metadata` JSON)
- `billingRateUsd`, `loadedCostUsd` as schema columns (use `metadata` JSON)
- `clientName`, `contractScope`, `guaranteeMetric` as schema columns
- Any reference to currencies (USD, BRL, EUR) hardcoded in schema or components

### ✅ Always use (generic, portable)
| Concept | Generic Term |
|---------|-------------|
| A person doing work | `Member`, `OrganizationMember` |
| A work item / job | `Project` |
| A progress checkpoint | `Milestone` |
| A granular action item | `Task` |
| A time log entry | `TimesheetEntry` |
| A site/field assignment | `Deployment` |
| A trackable physical item | `Asset` |
| Domain-specific custom data | `metadata` (JSON column) |
| An org-defined field schema | `MetadataTemplate` |
| A group of users | `Organization` |
| Access level | `Owner`, `Admin`, `Manager`, `Engineer`, `Viewer` |

---

## 3. Architecture Source of Truth

Before writing any code, agents MUST read the relevant blueprint document:

| Task | Read first |
|------|-----------|
| Database model or query | [`03_PRISMA_SCHEMA.md`](./03_PRISMA_SCHEMA.md) |
| New API route / endpoint | [`04_API_ROUTES.md`](./04_API_ROUTES.md) |
| New React component or page | [`05_COMPONENT_ARCHITECTURE.md`](./05_COMPONENT_ARCHITECTURE.md) |
| Data migration or seeding | [`06_MIGRATION_RUNBOOK.md`](./06_MIGRATION_RUNBOOK.md) |
| Deployment / env vars | [`07_ENVIRONMENT_AND_DEPLOYMENT.md`](./07_ENVIRONMENT_AND_DEPLOYMENT.md) |
| Overall structure / layout | [`02_DIRECTORY_TREE.md`](./02_DIRECTORY_TREE.md) |

---

## 4. Core Business Rules (Enforced in All Code)

### BR-01 — Overallocation Guard
A `Member` cannot be allocated beyond 100% of `capacityHrsPerWeek` in any given week.
All `ResourceAllocation` POST/PATCH handlers **must** compute the weekly sum before writing
and return HTTP 422 with `{ code: "OVERALLOCATION" }` if the limit would be exceeded.

```typescript
// REQUIRED check in POST /api/projects/[projectId]/allocations
const weeklyTotal = await prisma.resourceAllocation.aggregate({
  where: { memberId, organizationId, weekStartDate },
  _sum: { allocationPct: true },
});
if ((weeklyTotal._sum.allocationPct ?? 0) + newAllocationPct > 100) {
  return NextResponse.json({ error: "Exceeds capacity", code: "OVERALLOCATION" }, { status: 422 });
}
```

### BR-02 — Discipline Non-Fungibility (UI Warning Only)
When assigning members to tasks, if the task's required `discipline` differs from the
assigned member's `discipline`, surface a **non-blocking warning badge** — do not
prevent the assignment. Hard blocking is domain-specific and cannot be assumed generically.

### BR-03 — Deployment Capacity Freeze
When a `Deployment` is created with `status = ACTIVE` or `UPCOMING`, automatically query
for any `ResourceAllocation` records for that member in the overlapping date range and
write them to `Deployment.conflictFlags` as a JSON array. Surface these conflicts in the
Deployment detail page.

### BR-04 — Milestone Signoff Gate
A `Milestone` with `requiresSignoff = true` cannot transition to `APPROVED` or `COMPLETED`
status without a non-null `signoffByMemberId`. Enforce this in the API layer:

```typescript
if (["APPROVED", "COMPLETED"].includes(newStatus) && milestone.requiresSignoff) {
  if (!body.signoffByMemberId) {
    return NextResponse.json({ code: "SIGNOFF_REQUIRED", ... }, { status: 422 });
  }
}
```

### BR-05 — Tenant Isolation Is Non-Negotiable
Every Prisma query that touches any model with an `organizationId` field **must** include
`where: { organizationId: ctx.organizationId }`. No exceptions. Use `resolveTenantContext()`
at the top of every API route handler.

```typescript
// MANDATORY pattern in every route handler
const ctx = await resolveTenantContext(req);
if (ctx instanceof NextResponse) return ctx; // Handles 401/403 automatically
```

### BR-06 — Audit Every Mutation
All `CREATE`, `UPDATE`, and `DELETE` operations on `Project`, `Milestone`, `Task`,
`OrganizationMember`, `ResourceAllocation`, and `Deployment` must call `createAuditEvent()`
after the Prisma write completes. This is not optional.

```typescript
await createAuditEvent({
  organizationId: ctx.organizationId,
  actorId:        ctx.userId,
  action:         "UPDATE",
  entityType:     "project",
  entityId:       project.id,
  before:         originalSnapshot,
  after:          updatedSnapshot,
});
```

---

## 5. RBAC Enforcement Rules

Agents must apply these role checks consistently. Server-side is authoritative;
client-side guards are UX-only. Use `can()` from `src/lib/permissions.ts` for named
capabilities and resource scope; route handlers must enforce the same checks.

| Capability | Scope |
|-----------|-------|
| View shared task board | Every active organization member sees every project task; mutation permissions still apply |
| View project details and allocations | Project members and leads; Admin and Owner organization-wide |
| Create projects | Manager, Admin, Owner |
| Edit projects and milestones | Project lead; Admin and Owner |
| Create tasks | Engineer+ in a project they belong to |
| Edit task details | Manager+ in a project they belong to |
| Move assigned task / log own time | Engineer+; task moves require the actor to be assigned |
| View team timesheets / approve | Manager in their direct/indirect reporting tree; Admin and Owner organization-wide |
| Edit allocation | Manager in the project and member's reporting scope; Admin and Owner organization-wide |
| Edit own profile | Any role; Managers may manage profiles in their reporting tree |
| Invite members, change roles, manage metadata, access audit log | Admin and Owner |
| Create/edit deployments | Manager in project scope; Admin and Owner organization-wide |
| Read organization assets | Viewer+; checkout and asset administration require Manager+ |
| Transfer ownership, deactivate organization, permanently delete project | Owner |

Role hierarchy (lowest → highest): `VIEWER` < `ENGINEER` < `MANAGER` < `ADMIN` < `OWNER`

Use `can(ctx, capability, resource)` from `src/lib/permissions.ts`. Use
`roleAtLeast(userRole, minimumRole)` from `src/lib/rbac.ts` only for presentation checks
or where a capability is not relevant; never write manual role string comparisons inline.

---

## 6. Dynamic Metadata Rules

**Never** add domain-specific columns to any schema model to accommodate a particular
engineering discipline. All domain-specific data lives in `metadata Json?` columns,
validated against the org's `MetadataTemplate`.

When an agent receives a request like "add a field for pipe diameter", the correct
response is:
1. Add the field to the org's `MetadataTemplate` via the `/settings/metadata-templates` UI
2. The field will automatically appear in `<MetadataCard>` for Projects or Assets
3. **Not**: add `pipeDiameter` as a column to the `Project` model

---

## 7. File Placement Rules

Every new file must follow the directory structure in [`02_DIRECTORY_TREE.md`](./02_DIRECTORY_TREE.md).

| What you're creating | Where it goes |
|---------------------|--------------|
| Page component | `src/app/(dashboard)/[section]/page.tsx` |
| Reusable display component | `src/components/data-display/` |
| Form component | `src/components/forms/` |
| Chart component | `src/components/charts/` |
| API route | `src/app/api/[resource]/route.ts` |
| Zod validation schema | `src/lib/validations/[resource].ts` |
| TypeScript types | `src/types/[domain].ts` |
| Auth / tenant utility | `src/lib/` |

---

## 8. Tech Stack Constraints

| Layer | Mandated technology | Forbidden |
|-------|--------------------|----|
| Framework | Next.js 16 (App Router) | Pages Router patterns |
| Styling | Tailwind CSS + shadcn/ui | Inline styles, CSS modules (except globals) |
| Database | PostgreSQL + Prisma ORM | Raw SQL without Prisma, any NoSQL |
| Auth | Auth.js v5 (NextAuth) | Custom JWT implementation, Clerk, Auth0 |
| Validation | Zod (client + server) | Yup, manual validation |
| State | RSC + Zustand for client islands | Redux, MobX, Context for data fetching |
| Data fetching (server) | React Server Components + Prisma | tRPC, REST client-side fetching for initial loads |
| Forms | React Hook Form + Zod resolver | Formik, uncontrolled inputs |
| Tables | TanStack Table v8 | AG Grid, react-table v7 |
| Drag-and-drop | `@dnd-kit/core` | react-beautiful-dnd (unmaintained) |
| Email | Resend (cloud) / Nodemailer (self-host) | SendGrid, Mailchimp |
| File storage | Vercel Blob / S3-compatible | Hardcoded local file paths |
| Payments | **None — explicitly prohibited** | Stripe, Paddle, Lemon Squeezy |

---

## 9. Design & UI Standards

### Anti-Generic Rules (strictly enforced)
- **No purple/cyan glow cards** — use intentional palette choices from the design token system
- **No lazy centered text stacks** — every page needs visual hierarchy and information density
- **No unstyled table borders** — use refined stroke weights and subtle row separations
- **No placeholder lorem ipsum** — all UI copy must read like real engineering data

### Typography Scale
- Headings: `font-semibold tracking-tight` with `text-foreground`
- Sub-labels: `text-muted-foreground text-sm`
- Monospace data (codes, IDs): `font-mono text-xs`
- Status indicators: always `<StatusBadge>` component — never raw text

### Color Usage
- Status colors: defined in `STATUS_COLORS` map in `StatusBadge.tsx` — no ad-hoc Tailwind color classes for status
- Destructive actions: `text-destructive` / `bg-destructive/10`
- Overallocation: `text-red-400 bg-red-500/20 animate-pulse` — reserved exclusively for capacity overflow

### Animation Policy
- Hover transitions: `transition-colors duration-150` minimum on all interactive elements
- Page transitions: use Next.js `<Link>` with View Transitions API where supported
- Loading states: `<Skeleton>` component — never spinners on data tables
- Overallocation pulse: `animate-pulse` is **only** acceptable on capacity overflow indicators

### Micro-copy & Labels
- Button labels: verb-first, concise. "Create Project" not "Submit New Project Form"
- Empty states: always include an action. Never just "No data found."
- Error messages: specific, actionable. "Week allocation exceeds 100% — reduce by X hours." not "Error"

---

## 10. Next.js 16 App Router Rules

<!-- BEGIN:nextjs-agent-rules -->

### This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ
from your training data. Read the relevant guide in `node_modules/next/dist/docs/`
(resolved from this file's directory) before writing any code. If package docs are absent,
use the official version-specific Next.js documentation. Heed deprecation notices.

**Critical App Router rules for this codebase:**

1. **Server Components by default** — only add `"use client"` when you need browser APIs,
   event handlers, or React hooks. Data fetching belongs in Server Components.

2. **`params` and `searchParams` are Promises in Next.js 16** — always `await` them:
   ```typescript
   // ✅ Correct
   export default async function Page({ params }: { params: Promise<{ id: string }> }) {
     const { id } = await params;
   }
   // ❌ Wrong (Next.js 14 pattern)
   export default function Page({ params }: { params: { id: string } }) { ... }
   ```

3. **Route Handlers** replace API Routes — use `export async function GET(req: NextRequest)`
   inside `route.ts` files, not `handler` default exports.

4. **Server Actions** for form mutations — prefer `action={serverAction}` on `<form>` over
   client-side fetch calls to API routes for simple mutations.

5. **`cookies()` and `headers()` are async** in Next.js 16:
   ```typescript
   const cookieStore = await cookies();
   const headersList = await headers();
   ```

6. **Loading UI**: use `loading.tsx` co-located with `page.tsx` for Suspense boundaries.

7. **Error boundaries**: use `error.tsx` (must be a Client Component with `"use client"`).

<!-- END:nextjs-agent-rules -->

---

## 11. Git & PR Conventions

> [!IMPORTANT]
> **Agents may only `git commit` — never `git push`.** Do not push to any remote under any
> circumstances. Stage and commit changes locally, then stop. Pushing is reserved for the
> human engineer.

- **Commit format**: `type(scope): description`
  - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`
  - Scope: `auth`, `projects`, `members`, `timesheets`, `deployments`, `assets`, `schema`, `ui`
  - Example: `feat(projects): add metadata template selector to project form`
- **No commits containing**: company names, client names, or domain-specific terminology
- **PR titles** must be self-contained: "Add overallocation guard to resource allocation API"
- **Branch naming**: `feat/[scope]-[short-description]`, e.g. `feat/projects-metadata-template-ui`

---

## 12. Shippable Chunk Order (Recommended Build Sequence)

When building out the platform, implement in this order to maintain a working app
at each phase:

```
Phase 1 — Foundation
  ├── Prisma schema + migrations
  ├── Auth.js setup (email/password)
  ├── Organization + OrganizationMember seeding
  └── Tenant middleware (resolveTenantContext)

Phase 2 — Core Shell
  ├── Dashboard layout (Sidebar, Topbar)
  ├── OrgProvider + SessionProvider
  ├── ThemeProvider (dark/light)
  └── PageShell component

Phase 3 — Projects Module
  ├── Project list page + DataTable
  ├── Project create/edit form
  ├── Milestone management
  └── Task board (Kanban)

Phase 4 — Members & Allocations
  ├── Member directory
  ├── Member profile + invite flow
  ├── ResourceAllocation CRUD + overallocation guard
  └── CapacityHeatmap component

Phase 5 — Timesheets & Deployments
  ├── Timesheet weekly grid
  ├── Timesheet approval workflow
  ├── Deployment management
  └── Conflict flag UI

Phase 6 — Assets & Metadata
  ├── Asset registry CRUD
  ├── MetadataTemplate builder (admin)
  └── MetadataCard dynamic renderer

Phase 7 — Admin & Compliance
  ├── Audit log viewer
  ├── Org settings (general, members, integrations)
  └── Invitation management

Phase 8 — Polish & Hardening
  ├── Error boundaries on all routes
  ├── Loading skeletons on all data tables
  ├── Responsive mobile layout (MobileNav)
  └── E2E smoke tests (Playwright)
```

---

## 13. Prohibited Patterns (Hard Rules)

These patterns must **never** appear in any generated code:

```typescript
// ❌ Querying without organizationId filter
const projects = await prisma.project.findMany(); // Missing tenant scope

// ❌ Hardcoded domain terminology in component labels
<th>Feedstock Type</th>
<td>{project.technologyLicensed}</td>

// ❌ Payment/billing logic
import Stripe from "stripe";
const subscription = await stripe.subscriptions.create(...);

// ❌ Company-specific references in any string literal
const DEFAULT_ORG = "KATZEN International";

// ❌ Skipping audit log on mutations
await prisma.project.update({ ... }); // Missing createAuditEvent() call

// ❌ Trusting client-supplied organizationId
const orgId = req.body.organizationId; // Must come from session, not request body

// ❌ Inline role string comparisons
if (session.user.role === "admin") { ... } // Use roleAtLeast() helper

// ❌ Truncated code output
// ... rest of component
// TODO: implement this
```

---

*This AGENTS.md is the authoritative governance document for the SaaS platform codebase.
All agents, contributors, and automated tools must adhere to these rules without exception.*

*Blueprint documents: [`docs/00_INDEX.md`](./00_INDEX.md)*
