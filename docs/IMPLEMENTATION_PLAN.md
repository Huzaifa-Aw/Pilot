# Engineering Management SaaS — Implementation Plan

## Purpose

Turn the repository's blueprint into a working, white-label, multi-tenant engineering
management SaaS for cloud or self-hosted use. The product covers organizations,
projects, milestones, tasks, members, capacity planning, timesheets, deployments,
assets, configurable metadata, role-based access, and audit history.

This document organizes the existing blueprint into implementation phases. It is a
plan only; no application features are implemented by this document.

## Rules that apply in every phase

- Keep product language and data models generic and organization-neutral.
- Do not add payment, subscription, or tier-gating functionality.
- Resolve the active organization from authenticated membership; do not trust a
  client-provided organization ID.
- Enforce tenant scope and role authorization on the server for every read and write.
- Audit required mutations and validate untrusted inputs.
- Build responsive interfaces mobile-first: prioritize clear navigation, readable
  content, and touch-friendly controls on phone screens, then adapt for larger screens.
- Follow the shared visual tokens and component patterns in
  [08_DESIGN.md](./08_DESIGN.md) across every product module.
- Use the mandated stack and conventions in [AGENTS.md](../AGENTS.md).
- Each phase must leave the application in a working, testable state.

## Phase 1 — Platform foundation

**Goal:** Establish the data, identity, tenant, and authorization foundations.

**Implement**

- Project setup, environment configuration, PostgreSQL connection, Prisma client,
  schema, migration workflow, and a safe development seed.
- Generic core models and organization membership roles.
- Authentication, invitation-only access by default, and initial organization setup.
- Tenant-context and role-checking helpers.
- Shared input validation, error handling, and audit-event utilities.

**Blueprint coverage**

- [01_ARCHITECTURE_OVERVIEW.md](./01_ARCHITECTURE_OVERVIEW.md): layers, tenancy,
  authentication, and core entities.
- [02_DIRECTORY_TREE.md](./02_DIRECTORY_TREE.md): repository and source layout.
- [03_PRISMA_SCHEMA.md](./03_PRISMA_SCHEMA.md): database models and relations.
- [04_API_ROUTES.md](./04_API_ROUTES.md): tenant context, standard responses, and
  organization/member access contracts.
- [06_MIGRATION_RUNBOOK.md](./06_MIGRATION_RUNBOOK.md): data migration approach, if
  there is existing data to preserve.
- [07_ENVIRONMENT_AND_DEPLOYMENT.md](./07_ENVIRONMENT_AND_DEPLOYMENT.md): required
  environment configuration.

**Completion checks**

- Application installs, validates the schema, type-checks, and builds.
- Organization memberships and role hierarchy are tested.
- Requests without valid membership are denied; tenant-owned data cannot be accessed
  across organizations.

## Phase 2 — Responsive application shell

**Goal:** Give authenticated members a clear, consistent way to navigate the product.

**Implement**

- Protected dashboard layout, organization context, account controls, and navigation.
- Reusable page shell, design tokens, accessible UI primitives, and shared loading,
  empty, and error states.
- Establish the visual system from [08_DESIGN.md](./08_DESIGN.md): blue primary and
  orange accent, neutral surfaces, semantic feedback colors, Poppins headings, Inter
  interface text, the 4px spacing grid, and shared radius/elevation tokens.
- Build the documented buttons, status badges, cards, form controls, tables, dialogs,
  and alert patterns as reusable components.
- Implement the documented shell: dark 240px sidebar on desktop and an off-canvas
  sidebar below 768px. Start layout decisions at phone width, with compact padding and
  responsive KPI grids, then enhance for larger screens.
- Use Lucide icons and the design document's focus, contrast, and reduced-motion
  guidance.
- Organization switcher when a user belongs to multiple organizations.

**Blueprint coverage**

- [02_DIRECTORY_TREE.md](./02_DIRECTORY_TREE.md): app, component, provider, and style
  placement.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): layout shell,
  navigation, theme, guards, and display patterns.
- [08_DESIGN.md](./08_DESIGN.md): visual identity, tokens, typography, components,
  responsive shell, iconography, accessibility, and usability.

**Completion checks**

- Protected pages require an authenticated, active organization membership.
- Primary navigation and page structure work with touch input on phone widths and
  remain usable on tablet and desktop.
- Keyboard focus, labels, and responsive states are verified.

## Phase 3 — Projects, milestones, and tasks

**Goal:** Deliver the primary work-planning workflow.

**Implement**

- Project list, search/filter, creation, editing, archive, and detail views.
- Milestone management, progress tracking, and required signoff transitions.
- Task list/board, status and priority changes, and member assignments.
- Project and milestone metadata fields driven by organization templates.
- Required audit events for mutations.

**Blueprint coverage**

- [03_PRISMA_SCHEMA.md](./03_PRISMA_SCHEMA.md): Project, Milestone, Task, assignment,
  and metadata models.
- [04_API_ROUTES.md](./04_API_ROUTES.md): project, milestone, and task contracts,
  authorization, and signoff gate.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): project forms,
  tables, status badges, metadata cards, and task views.

**Completion checks**

- All project, milestone, and task operations are tenant-scoped and role-protected.
- Signoff-required milestones cannot be approved or completed without signoff.
- Mobile views remain readable and usable; changes are audited.

## Phase 4 — Members and capacity planning

**Goal:** Manage organization membership and plan weekly availability.

**Implement**

- Member directory and profile.
- Invitation creation and acceptance, role management, and member deactivation.
- Weekly project allocations and capacity summary/heatmap.
- Overallocation checks for create and update.

**Blueprint coverage**

- [03_PRISMA_SCHEMA.md](./03_PRISMA_SCHEMA.md): OrganizationMember, Invitation, and
  ResourceAllocation.
- [04_API_ROUTES.md](./04_API_ROUTES.md): member/invitation and allocation contracts,
  authorization, and capacity guard.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): member forms,
  directory, role guards, and capacity views.

**Completion checks**

- Invitation expiry, single use, and role permissions are verified.
- Allocation writes cannot exceed the member's weekly capacity, including when an
  existing allocation is edited or concurrent changes are attempted.
- Member and allocation mutations are audited and tenant-isolated.

## Phase 5 — Timesheets and deployments

**Goal:** Support time capture, approval, and deployment coordination.

**Implement**

- Weekly timesheet entry, submission, review, approval, and flagging.
- Server-side time total calculation and ownership/role checks.
- Deployment scheduling, detail views, checklists, and allocation-conflict flags.
- Mobile-friendly weekly entry and deployment details.

**Blueprint coverage**

- [03_PRISMA_SCHEMA.md](./03_PRISMA_SCHEMA.md): TimesheetEntry and Deployment.
- [04_API_ROUTES.md](./04_API_ROUTES.md): timesheet and deployment contracts and
  business rules.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): forms, schedule,
  detail, and conflict display patterns.

**Completion checks**

- Members can access only timesheets allowed by their role and ownership.
- Totals are computed and validated on the server; approvals require the right role.
- Deployment conflicts are calculated for overlapping dates and surfaced to users.
- Relevant changes are audited and tenant-isolated.

## Phase 6 — Assets and configurable metadata

**Goal:** Track organization assets while allowing domain-specific details without
changing the shared schema.

**Implement**

- Asset registry, asset detail, and project-to-asset links.
- Metadata template management and dynamic metadata display/edit forms for supported
  entity types.
- Validation of metadata against the active organization's template.

**Blueprint coverage**

- [03_PRISMA_SCHEMA.md](./03_PRISMA_SCHEMA.md): Asset, ProjectAsset, and
  MetadataTemplate.
- [04_API_ROUTES.md](./04_API_ROUTES.md): asset and metadata-template contracts.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): MetadataCard,
  MetadataTemplateBuilder, and asset forms.

**Completion checks**

- Assets and templates cannot cross organization boundaries.
- Custom values are validated and rendered consistently in forms and detail pages.
- The schema remains domain-agnostic.

## Phase 7 — Administration and audit

**Goal:** Provide organization administration and a trustworthy read-only activity
history.

**Implement**

- Organization settings for name, branding, locale, and timezone.
- Member/role administration and metadata-template administration.
- Read-only, paginated audit log with supported filters.
- Integration settings only as described in the blueprint and only when a concrete
  integration is in scope.

**Blueprint coverage**

- [03_PRISMA_SCHEMA.md](./03_PRISMA_SCHEMA.md): Organization, Integration, and AuditLog.
- [04_API_ROUTES.md](./04_API_ROUTES.md): audit and metadata-template endpoints and
  role requirements.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): settings, guards,
  and administration components.

**Completion checks**

- Administrative operations enforce the documented role minimums.
- Audit history is readable by authorized members and cannot be modified through
  application routes.

## Phase 8 — Migration, deployment, and production readiness

**Goal:** Prepare the implemented product for safe deployment and operations.

**Implement**

- Execute and verify the data migration only if there is existing data to retain.
- Configure managed-hosting and self-hosted deployment paths from the implemented
  application configuration.
- Add CI checks, backups, restore instructions, security headers, rate limits, and
  operational error handling.
- Complete responsive, accessibility, and end-to-end testing across critical journeys.

**Blueprint coverage**

- [06_MIGRATION_RUNBOOK.md](./06_MIGRATION_RUNBOOK.md): backup, migration, verification,
  post-migration, and rollback.
- [07_ENVIRONMENT_AND_DEPLOYMENT.md](./07_ENVIRONMENT_AND_DEPLOYMENT.md): environment,
  hosting, self-hosting, CI/CD, security, and performance.
- [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md): loading, error,
  responsive, and component patterns.

**Completion checks**

- A clean deployment and rollback path is documented and exercised.
- Critical user journeys pass on phone and desktop.
- Tenant isolation, authorization, and audit behavior have automated coverage.

## Cross-phase document notes

- [00_INDEX.md](./00_INDEX.md) is the blueprint index and constraint summary; consult
  it throughout implementation.
- [08_DESIGN.md](./08_DESIGN.md) is the shared design-system source of truth. Define
  its tokens and reusable components in Phase 2, then apply them consistently in
  Phases 3–8.
- [AGENTS.md](../AGENTS.md) supplies the prescribed eight-phase build order and
  engineering rules; this plan groups the detailed documents around that order.
- Before implementing, reconcile blueprint examples that conflict with mandatory
  tenant isolation, multi-organization membership, mutation auditing, or other
  business rules. In particular, enforce tenant ownership across child relations,
  not only on top-level queries.
- Treat old domain-specific fields in the migration runbook as source-data mapping
  examples, not as product schema or UI requirements.
- Treat real-estate, leasing, rent, and payment examples in the design document as
  visual-only examples. Replace their labels and sample content with the generic
  engineering-management concepts in this blueprint. Follow the canonical status
  color map and other stricter UI rules in [AGENTS.md](../AGENTS.md) where guidance
  differs.
