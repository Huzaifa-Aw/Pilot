# 01 — Architecture Overview

> White-label, multi-tenant B2B SaaS Platform for Engineering Management

---

## 1. System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  Next.js 15 (App Router) · React 19 · Tailwind · shadcn/ui     │
│  Dynamic metadata cards · RBAC-gated views · Dark/Light theme   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS / Server Actions / REST
┌────────────────────────▼────────────────────────────────────────┐
│                        API / BFF LAYER                          │
│  Next.js Route Handlers · Tenant Isolation Middleware           │
│  Zod validation · Auth.js (NextAuth v5) session verification    │
└────────────────────────┬────────────────────────────────────────┘
                         │ Prisma Client (prepared statements)
┌────────────────────────▼────────────────────────────────────────┐
│                      DATA LAYER                                 │
│  PostgreSQL (Supabase / Neon / self-hosted)                     │
│  Row-level isolation via organizationId on every table          │
│  Audit log append-only table for compliance                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenancy Model

**Strategy: Shared Database, Shared Schema with Row-Level Isolation**

- Every mutable table carries an `organizationId` foreign key.
- Application middleware resolves `organizationId` from the authenticated session
  and injects it into every Prisma query via a factory helper.
- No tenant can ever read or mutate a row belonging to a different `organizationId`.

### Tenancy resolution flow

```
Request arrives
    │
    ▼
Auth.js validates JWT / session cookie
    │
    ▼
Middleware reads session.user.organizationId
    │
    ▼
withTenantContext(organizationId) wraps every DB call
    │
    ▼
Prisma WHERE clause always includes { organizationId }
    │
    ▼
Response returned (data already isolated)
```

---

## 3. RBAC Model

| Role | Capabilities |
|------|-------------|
| `Owner` | Full CRUD on all org resources + manage members + org settings |
| `Admin` | Full CRUD on all org resources, cannot delete org or transfer ownership |
| `Manager` | CRUD on Projects, Milestones, Allocations within their assigned scope |
| `Engineer` | Read all assigned resources, write own Timesheets and Task updates |
| `Viewer` | Read-only access to all org resources they are explicitly granted access to |

Roles are stored on the `OrganizationMember` join table, not on the `User` model,
enabling a user to be an `Admin` in Org A and a `Viewer` in Org B simultaneously.

---

## 4. Dynamic Metadata Architecture

The platform is domain-agnostic by design. Industry-specific fields are **not** hardcoded
into schema columns. Instead, every `Project` and `Asset` carries a `metadata` JSON column.

A per-organization `MetadataTemplate` record defines which keys exist, their labels,
data types, and display order. The UI reads the template and renders the appropriate
form fields and display cards dynamically.

```
MetadataTemplate (org A — Structural Engineering)
  └── fields: [
        { key: "stressLoadVectors", label: "Stress Load Vectors", type: "number" },
        { key: "materialGrade",     label: "Material Grade",       type: "select", options: ["A36","A572"] }
      ]

MetadataTemplate (org B — Software Engineering)
  └── fields: [
        { key: "sprintVelocity",    label: "Sprint Velocity",      type: "number" },
        { key: "techStack",         label: "Tech Stack",           type: "multi-select" }
      ]

→ Both organizations use the SAME React <MetadataCard /> component.
```

---

## 5. Authentication Strategy

- **Provider**: Auth.js v5 (NextAuth) with Email/Password + optional OAuth (Google, Microsoft).
- **Session**: JWT strategy. Session payload includes `userId`, `organizationId`, `role`.
- **Invitation flow**: Admin sends invite link with a signed token → new user registers → 
  `OrganizationMember` row created automatically.
- **No self-registration**: Users cannot create accounts without an org invite (configurable via `ALLOW_PUBLIC_SIGNUP` env flag for self-hosted deployments).

---

## 6. Core Data Entities

```
Organization
 ├── OrganizationMember (User ↔ Org with role)
 ├── MetadataTemplate (dynamic field definitions)
 ├── Project (primary work unit)
 │    ├── Milestone (gated progress checkpoints)
 │    ├── Task (granular work items)
 │    └── ResourceAllocation (member ↔ project assignment)
 ├── Member (User profile within org context)
 │    ├── TimesheetEntry (weekly time capture)
 │    └── Deployment (site/location assignments)
 ├── Asset (optional: equipment, documents, instruments)
 └── AuditLog (immutable event trail)
```

---

## 7. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo vs polyrepo | Monorepo (single Next.js app) | Simpler ops for v1; API routes co-located with UI |
| ORM | Prisma | Type-safety, migration tooling, Supabase/Neon compatibility |
| Auth | Auth.js v5 | First-class Next.js App Router support, flexible providers |
| UI Component Library | shadcn/ui + Tailwind | Fully owned components, no vendor lock-in |
| State Management | React Server Components + Zustand (client islands) | Minimal client JS, RSC for data-heavy views |
| File Storage | Vercel Blob / S3-compatible (env-configurable) | Swap via single env var for self-hosted |
| Email | Resend (env-configurable) | Simple API, swap to SMTP for self-hosted |

---

*Next: [`02_DIRECTORY_TREE.md`](./02_DIRECTORY_TREE.md)*
