# Migration SaaS — Blueprint Index

> **Purpose**: This folder documents the complete architectural pivot from a single-tenant, domain-specific engineering demo into a production-ready, white-label, multi-tenant B2B SaaS platform for any engineering discipline.

---

## Document Map

| # | File | What it covers |
|---|------|---------------|
| 1 | `01_ARCHITECTURE_OVERVIEW.md` | High-level system design, tenancy model, data-flow diagram, and layer responsibilities |
| 2 | `02_DIRECTORY_TREE.md` | Full annotated folder/file tree for the new SaaS codebase |
| 3 | `03_PRISMA_SCHEMA.md` | Complete generic, multi-tenant Prisma schema replacing the current domain-specific models |
| 4 | `04_API_ROUTES.md` | All REST API endpoints with tenant-isolation middleware, request/response contracts |
| 5 | `05_COMPONENT_ARCHITECTURE.md` | React component hierarchy, layout shells, dynamic metadata cards, and RBAC guards |
| 6 | `06_MIGRATION_RUNBOOK.md` | Step-by-step runbook for migrating existing records into the new schema safely |
| 7 | `07_ENVIRONMENT_AND_DEPLOYMENT.md` | Environment variables, Vercel/self-hosted config, and CI/CD pipeline blueprint |

---

## Core Constraints (always enforce)

1. **No specific branding** — zero company-specific names in code, schema, metadata, or copy.
2. **No payments/subscriptions** — no Stripe, no billing tables, no tier gating.
3. **Domain-agnostic naming** — `Project`, `Asset`, `Workspace`, `Milestone`, `Member`, `Resource` only.
4. **Tenant isolation is mandatory** — every query must be scoped to `organizationId`.
5. **RBAC roles**: `Owner` · `Admin` · `Manager` · `Engineer` · `Viewer` — no custom roles in v1.

---

## Reading Order for a New Developer

```
00_INDEX → 01_ARCHITECTURE → 02_DIRECTORY_TREE → 03_PRISMA_SCHEMA
→ 04_API_ROUTES → 05_COMPONENT_ARCHITECTURE → 06_MIGRATION_RUNBOOK → 07_DEPLOYMENT
```

---

*Last updated: 2026-10-21*
