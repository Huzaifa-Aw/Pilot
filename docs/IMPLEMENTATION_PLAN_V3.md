# Implementation Plan V3 — Workspace UX and Data Workflows

> Follow-on to [IMPLEMENTATION_PLAN_V2.md](./IMPLEMENTATION_PLAN_V2.md).
> This document records the requested scope, implementation sequence, and V3 delivery
> status. V2's delivered work remains the baseline.
>
> This plan covers the requests: organization sign-out, compact filters, a more
> Jira-like board with list mode and configurable workflows, allocation synchronization
> and date ranges, a compact member profile, a tabular audit log, workspace-shell
> refinements, non-technical forms, and CSV templates/imports for applicable sections.

Governing rules remain unchanged: [AGENTS.md](../AGENTS.md), tenant isolation on every
organization-owned query, server-side authorization, `createAuditEvent()` for required
mutations, Zod validation, domain-specific values in `metadata`, no payments, and
responsive/accessible UI. Read the relevant blueprint documents before implementation.

## Implementation status

The V3 feature work in Phases 0–7 has been implemented, including compact filters,
navigation changes, the workflow-aware board/list, allocation synchronization, profile
and audit layouts, JSON-free metadata controls, and CSV preview/confirm imports. Phase 8
documentation and focused automated checks are complete. See
[Section 15](#15-delivery-and-verification-record) for validation and remaining checks.

---

## 1. Current implementation findings

Verified in the current repository before planning:

| # | Request | Current implementation and root cause |
|---|---|---|
| 1 | Sign out from `/organizations/new` | [src/app/organizations/new/page.tsx](../src/app/organizations/new/page.tsx) has no account control. The dashboard already signs out through [src/components/layout/workspace-controls.tsx](../src/components/layout/workspace-controls.tsx). |
| 2 | Make filters compact across pages | Search/filter forms are always visible on the board, people, assets, projects, and audit log. Some other sections have range or tab selectors. There is no common filter popover or applied-filter chip pattern. |
| 3 | Improve Task Board and add list mode | The app already uses `@dnd-kit` in [src/components/data-display/task-board.tsx](../src/components/data-display/task-board.tsx), has six shared task statuses, swimlanes, and optimistic status updates. Desktop currently grids the columns instead of providing a Jira-style horizontal board; card assignees are initials with names only in a tooltip; there is no list view or column-collapse control. |
| 4 | Keep allocation percent and planned hours in sync; show duration and feedback | Allocations are stored as weekly rows. The create form derives displayed hours from percentage, but the edit form allows both numeric fields to change independently; the API rejects mismatched values. Edit/create controls show errors but no success confirmation. There is no date-range workflow to create weekly allocation rows across a selected period. |
| 5 | Make member utilization/timesheet metrics compact | [src/app/(dashboard)/members/[memberId]/page.tsx](../src/app/(dashboard)/members/%5BmemberId%5D/page.tsx) renders utilization and monthly time as two full-width cards in the main document flow. |
| 6 | Apply the compact-filter improvement to assets | [src/app/(dashboard)/assets/page.tsx](../src/app/(dashboard)/assets/page.tsx) has several always-visible fields, though filter query logic is already shared in [src/lib/asset-filters.ts](../src/lib/asset-filters.ts). |
| 7 | Redesign audit log | [src/app/(dashboard)/audit-log/page.tsx](../src/app/(dashboard)/audit-log/page.tsx) displays each event as a large card. Before/after JSON is available through `<details>`. The current `AuditLog` model has no outcome field, and events are generally written after successful mutations. |
| 8 | Prevent workspace name clipping | [src/components/layout/Topbar.tsx](../src/components/layout/Topbar.tsx) and [src/components/layout/workspace-controls.tsx](../src/components/layout/workspace-controls.tsx) use constrained, truncated labels that can leave the workspace name hard to read. |
| 8.1 | Keep desktop navigation collapsed until hover | [src/components/layout/Sidebar.tsx](../src/components/layout/Sidebar.tsx) is currently a fixed 240px desktop sidebar; its width is defined in [src/styles/tokens.css](../src/styles/tokens.css). Mobile navigation is separate. |
| 9 | Provide CSV templates/imports by section | Assets already have a paste-based CSV importer in [src/components/forms/asset-csv-import-form.tsx](../src/components/forms/asset-csv-import-form.tsx), parser in [src/lib/asset-csv.ts](../src/lib/asset-csv.ts), and endpoint in [src/app/api/assets/import/route.ts](../src/app/api/assets/import/route.ts). It creates assets but does not upload a file, download a template, preview rows, or update existing assets. Other sections have no CSV import flow. |
| 10 | Do not ask non-technical users for JSON | [src/components/forms/deployment-form.tsx](../src/components/forms/deployment-form.tsx) asks users to edit checklist JSON and a metadata JSON object; the deployment detail page also renders metadata as raw JSON. [src/app/(dashboard)/audit-log/page.tsx](../src/app/(dashboard)/audit-log/page.tsx) renders before/after snapshots as raw JSON. [src/components/forms/metadata-fields-editor.tsx](../src/components/forms/metadata-fields-editor.tsx) and [src/components/forms/metadata-template-builder.tsx](../src/components/forms/metadata-template-builder.tsx) already provide visual field-based editing. Internal API `JSON.stringify` calls are transport code, not user-facing JSON inputs. |

---

## 2. Decisions and boundaries

1. **Preserve current data and authorization rules.** Do not weaken role checks, tenant
   scoping, or existing business rules to make UI interactions easier.
2. **Use existing libraries.** Reuse `@dnd-kit` for board movement and the existing
   asset CSV parser/import as the first section's pattern. Do not add a UI, table, or
   drag-and-drop dependency for this scope.
3. **Make filter state URL-backed.** Server-rendered results, refresh, browser history,
   and shareable links must agree on which filters are active. Filters remain data
   scoping in the query layer, never an authorization boundary.
4. **Keep allocations weekly in storage.** `ResourceAllocation` has `weekStartDate`;
   it does not represent an arbitrary continuous interval. A user-selected date range
   therefore creates one allocation per covered Monday/week, with weekly overallocation
   validation for every row. Do not add redundant range columns unless the product
   requirement changes to a distinct interval model.
5. **Keep member creation invitation-based.** A member CSV must never create accounts
   with CSV-supplied passwords. It may update existing organization members by email;
   new people continue through the invite flow.
6. **Build one shared task board with configurable workflows.** Do not add sprints,
   epics, or multiple boards. Do add organization-scoped labels, flags, configurable
   workflow statuses/transitions, and visual rules for fields required in workflow
   stages/sections. Support workflow definitions assignable to projects while
   retaining one shared board.
7. **Record audit outcomes with severity and failure category.** Successful mutations
   are informational success events. User-caused validation/business-rule failures
   are warnings; unexpected application/database failures are errors. Persist a
   machine-readable category that distinguishes user error from application
   malfunction. Do not label missing events as failures or store credentials, raw
   request bodies, or sensitive exception details.
8. **CSV imports are upserts, never implicit deletes.** Each section must document its
   matching key and blank-cell behavior. A CSV that omits a row must not delete it.
9. **Keep configuration usable without JSON knowledge.** Provide ordinary labeled
   forms, field builders, checklist editors, label/workflow configuration controls,
   and readable detail views. JSON remains an internal storage/API format, not an
   end-user input requirement.

---

## 3. Phase 0 — Shared filter interaction

**Goal:** Keep filtering discoverable without letting filter controls consume the page.

### 3.1 Interaction

- Add a compact **Filter by** button with the active-filter count. It opens an accessible
  popover/disclosure containing only the filters applicable to that section.
- Keep common search/date controls compact and visible only where they provide clear
  value; allow date ranges to be chosen without opening a large panel.
- Render applied filters as concise chips near the results. Each chip removes only its
  own query parameter; a **Clear all** action resets filters without changing the route.
- Preserve unrelated query state such as selected view, sort, or tab. Reset pagination
  when a filter changes.
- Validate/normalize query values on the server before using them in Prisma queries.
- Add one shared component only if it can cover the relevant routes without hiding
  section-specific server filtering or duplicating their query semantics.

### 3.2 Apply the pattern

1. Task board — use all appropriate task fields defined in the current `Task` model:
   title/description, project, milestone, status, priority, assignees, start/due dates,
   estimated/actual hours, required discipline, parent/blocker links, and metadata
   fields whose active organization template defines a supported filter operation.
   Users choose these by human-readable field label and value; never ask them to type
   JSON or a metadata key.
2. People — preserve existing search, role, discipline, manager, active, and
   availability filters.
3. Assets — preserve search, category, availability, assigned member, linked project,
   location, and sort behavior.
4. Projects — preserve search and status filters.
5. Audit log — preserve entity, actor, action, and date filters.
6. Reports, timesheets, and other existing section-specific range/tab controls — review
   during implementation; compact only where there is a real filter form. Do not force
   a filter popover onto pages that have no filters.

**Exit checks**

- Filter UI is collapsed by default and remains usable by keyboard, screen reader, and
  touch.
- Active chips exactly match validated URL state and can be removed one at a time.
- Results, sorting, pagination, and browser back/forward remain correct.
- Tenant and role scoping are unchanged; filters cannot broaden data access.
- Unit tests cover query parsing and chip/query serialization for representative pages.

---

## 4. Phase 1 — Organization sign-out and navigation shell

### 4.1 Organization sign-out (request 1)

- Add a visible sign-out action to the `/organizations/new` shell, reusing the current
  Auth.js sign-out behavior and styling conventions.
- Make it a separate button/link from the organization form submit action.
- Return the user to `/login` after clearing the session.

**Exit checks:** authenticated user can sign out from the page; the session is cleared;
protected routes redirect to login; keyboard and mobile interaction work.

### 4.2 Workspace title and collapsed sidebar (requests 8 and 8.1)

- Rework topbar flex sizing so the title, workspace selector/name, and sign-out control
  do not overlap at narrow desktop widths.
- Keep long names visually constrained where necessary, but expose the full name to
  assistive technology and by tooltip/title on hover/focus.
- On desktop, show a narrow icon rail by default; expand it while the pointer is over
  the sidebar and while a keyboard user focuses within it. Collapse when neither state
  applies.
- Add accessible names/tooltips for the collapsed links; retain the visible expanded
  labels, active-route indicator, and existing role-filtered navigation.
- Preserve the separate mobile navigation and its open/close behavior.
- Coordinate the sidebar-width token and page layout so expansion does not cause
  clipping or an unexpected content jump.

**Exit checks:** long workspace names do not clip essential controls; the sidebar
starts collapsed on desktop, expands on hover/focus, and every route remains keyboard
accessible; mobile navigation is unchanged.

### 4.3 Human-friendly configuration and data entry

- Remove user-facing raw JSON editors. In particular, replace the checklist JSON and
  metadata JSON textareas in
  [src/components/forms/deployment-form.tsx](../src/components/forms/deployment-form.tsx)
  with a visual checklist editor and the shared field-based metadata editor.
- Extend the organization metadata-template builder and validation to support
  deployments. Allow Admins to configure field labels, types, options, requiredness,
  and a named form section through ordinary controls.
- Add section grouping to custom field definitions so users see named, clearly
  explained sections rather than internal metadata keys.
- Render deployment metadata in readable labeled fields instead of a JSON dump.
  Render audit before/after data as a human-readable field-by-field change summary;
  raw JSON should not be the default detail view.
- Review the UI for other user-facing prompts to enter JSON. Keep JSON serialization
  inside API/storage code; it is not itself a user-facing JSON request. Existing
  metadata editors and template builder are visual controls and should be reused.

**Exit checks:** no normal user flow requires typing or understanding JSON; deployment
checklist/metadata and custom fields remain editable and validated; audit details are
readable without parsing raw JSON.

---

## 5. Phase 2 — Task board and list view (request 3)

**Goal:** Deliver a Jira-inspired task workspace with issue labels, flags, configurable
workflows, required fields, and list/board views while retaining one shared board.

### 5.1 Workflow and task configuration foundation

- Add organization-scoped workflow definitions and ordered workflow statuses, with
  configurable allowed transitions. Allow a workflow to be assigned to a project;
  retain a single shared board, not separate boards per project.
- Add a default workflow matching today's task statuses and migrate existing tasks to
  it without changing their status meaning or project/task IDs.
- Keep a stable status category for reporting/business logic while storing the selected
  workflow status for its user-facing name and board position. Validate that each
  project's tasks use statuses from its assigned workflow; do not trust client-provided
  workflow or organization IDs.
- Add a visual Admin workflow editor to create/rename/reorder/deactivate statuses,
  choose status category, and configure allowed transitions. Prevent deactivation of
  statuses still used by tasks until those tasks are remapped.
- Add organization-scoped reusable labels and task-label assignment, with search and
  color choices from the existing semantic palette. Labels are visible on cards and
  available in filters.
- Add a task flag action (flag/unflag, optional plain-language reason, actor/time
  history) with an audit event. Flagging is distinct from task status and priority.
- Configure required fields by workflow status and named task-form section. The visual
  editor selects built-in fields and configured custom fields; server-side transition
  validation prevents moving a task when required values are missing.
- Support organization-defined custom metadata fields grouped by readable section
  names. Extend `MetadataTemplate`/field validation and task form rendering as needed;
  no raw JSON entry and no domain-specific schema columns.
- Keep task create/open/detail/edit workflows available: users can create a task, open
  its detail view from board/list, see current status/labels/flag/assignee, and edit
  fields allowed by their role.

### 5.2 Board mode

- Refactor [src/components/data-display/task-board.tsx](../src/components/data-display/task-board.tsx)
  to a horizontally scrollable row of status columns at desktop widths; avoid the
  current grid that compresses all six statuses into the page.
- Allow each status/workflow column to collapse and expand, with its task count still
  visible. Keep collapse state local to the view; do not create per-user persisted
  preferences in this phase.
- Show the workflow assigned to the selected project. When multiple workflows are
  present in an unfiltered shared view, group columns by workflow or use a clear
  workflow selector; never allow a drop into a status that is invalid for that task's
  project.
- Keep `@dnd-kit` mouse and keyboard sensors, permission-aware movement, optimistic
  status/order updates, API validation, and rollback on failure.
- Show each assigned member's name on the card. Avatars may supplement names but must
  not be the only way to identify assignees.
- Preserve supported card context: task key/title, project, priority, due date,
  milestone, estimate/actual time, labels, flag state, deployment indicator, and
  discipline mismatch warning.
- Keep existing grouping/swimlanes by project/assignee where possible; ensure board
  filters and swimlanes do not accidentally allow cross-lane drops.
- On touch devices, retain a clear status picker and horizontal column navigation;
  dragging is not the only way to move a task.

### 5.3 List mode

- Add a Board/List view toggle above the results.
- List mode is a compact, responsive table of the same filtered tasks, with sortable
  columns for supported fields and links to task details.
- Show task, project, workflow status, priority, named assignees, labels, flag state,
  due date, and hours at minimum.
- Preserve filter state when switching views. Apply the same role-aware mutation rules
  if list-mode quick actions are included.

### 5.4 Task filters

- Move the current always-visible board form into the Phase 0 compact filter control.
- Support filters for all useful task properties, including workflow/status, label,
  flag, project, assignee, priority, milestone, date range, “my tasks,” search, hours,
  required discipline, parent/blocker, and template-defined metadata fields. Display
  human-readable labels and field values; users must not enter JSON or internal keys.
- Use the same validated server query for board and list mode.

**Exit checks**

- Configured workflow columns scroll horizontally and can be hidden/restored
  independently; one shared board remains the only board.
- Drag/reorder persists after refresh and failures restore the prior state with a clear
  message; unauthorized updates are rejected by the API.
- Named assignees are visible; both modes render the same filtered task IDs.
- Labels and flags can be added/removed with role checks and audit events; workflows,
  transition restrictions, and required fields are enforced server-side.
- Keyboard users can move tasks; touch users have a non-drag interaction.
- Tests cover data migration, board/list query parity, workflow transitions, required
  fields, labels/flags, filters, column states, and permission failures.

---

## 6. Phase 3 — Allocation synchronization, date range, and feedback (request 4)

**Goal:** Make displayed/planned capacity unambiguous and keep calendar, heatmap, and
stored weekly allocations consistent.

### 6.1 Percentage/hours synchronization

- Update create and edit forms in
  [src/components/forms/allocation-form.tsx](../src/components/forms/allocation-form.tsx).
- Whichever of allocation percentage or planned hours the user edits last is the source
  value; recalculate the other from the selected member's `capacityHrsPerWeek`.
- Display clear precision/rounding rules. Keep final server validation authoritative
  and retain the existing weekly 100% overallocation guard.
- Use the same component behavior from project allocations, People & Allocations, and
  member-profile allocation editing.

### 6.2 Date range behavior

- Replace the single-week-only create experience with start/end dates and make the
  weekly consequence explicit in the UI (for example, “creates one allocation per
  Monday in the selected range”).
- Normalize the selected dates to covered Monday weeks and show the exact weeks before
  saving. Validate start <= end and reject ranges outside the supported bound.
- Create or update all affected weekly rows in one transaction. Validate duplicate
  member/project/week rows and weekly overallocation for every affected week; no
  partial save if any week fails.
- Keep the range semantics aligned with the current weekly database model and update
  the allocation list and capacity heatmap/calendar from the persisted rows.
- For editing a single existing weekly row, do not silently turn it into a multi-week
  series; range editing must be an explicit action.

### 6.3 User feedback

- Show a success status after create, update, or delete; retain the existing actionable
  error responses and validation messages.
- Refresh displayed allocations and capacity after successful writes, including the
  edit control embedded in the member profile.

**Exit checks**

- Editing either percentage or hours recalculates the other immediately and matches
  server-side values within the defined rounding tolerance.
- Every selected Monday receives exactly one row; an invalid/overallocated week rolls
  back the whole multi-week write.
- Heatmap, member utilization, and project allocation views agree after save.
- Success and failure feedback is visible and accessible on every edit surface.
- Unit/API tests cover conversion rounding, date normalization, duplicates, overalloc
  across a range, and transactional rollback.

---

## 7. Phase 4 — Compact member profile metrics (request 5)

- Rework the profile layout in
  [src/app/(dashboard)/members/[memberId]/page.tsx](../src/app/(dashboard)/members/%5BmemberId%5D/page.tsx)
  into a primary content column with a compact right-side metrics rail on desktop.
- Move weekly utilization and monthly timesheet summary into compact metric cards;
  stack them after the primary profile information on mobile.
- Preserve capacity values, chart/trend context, monthly logged/expected totals, and the
  timesheet link. Keep the metrics useful without taking a large share of the screen.
- Do not change the underlying calculations or expose private profile data to roles
  that cannot access it.

**Exit checks:** desktop shows compact metrics in a right rail; mobile stacks cleanly;
existing values reconcile with source records; permissions and accessibility remain.

---

## 8. Phase 5 — Compact audit table and honest outcomes (request 7)

**Goal:** Make the log scannable while keeping detailed change metadata available.

### 8.1 Table presentation

- Replace large per-event cards in
  [src/app/(dashboard)/audit-log/page.tsx](../src/app/(dashboard)/audit-log/page.tsx)
  with compact, responsive rows.
- Columns: timestamp, actor, action, entity/record, outcome, severity, and a concise
  failure category where applicable. Use truncation for long identifiers and retain
  accessible full values.
- Reveal a human-readable before/after field summary only when requested. Do not make
  raw JSON the detail UI for normal workspace administrators.
- Preserve Admin+ access and read-only audit behavior.

### 8.2 Outcome data

- Extend audit records with a persisted outcome, severity, and failure category. Use
  stable values such as `SUCCESS`/`FAILURE`, `INFO`/`WARNING`/`ERROR`, and
  `USER_ERROR`/`APPLICATION_ERROR`; record a safe error code and correlation/reference
  ID, not stack traces or raw request data.
- Successful committed mutations are `SUCCESS` + `INFO`. Authenticated input,
  validation, permission, and business-rule failures are `FAILURE` + `WARNING` +
  `USER_ERROR`. Unexpected application, database, and infrastructure failures are
  `FAILURE` + `ERROR` + `APPLICATION_ERROR`.
- Classify errors at the API boundary using known validation/business error codes;
  unknown exceptions are application errors. Do not convert unexpected errors into
  successful responses.
- Record failure events outside a business transaction that rolled back. If audit
  logging itself fails, report that explicitly through server logging/monitoring; do
  not silently pretend the audit event was written.
- Apply safe rate limiting/deduplication to repeated warning events. Do not log
  credentials, full request bodies, personal secrets, or raw database errors.
- Migrate historical audit entries as successful informational events because current
  mutation audit calls occur after successful writes. Never infer failure from a
  missing event.
- Include authenticated mutation attempts that fail validation/authorization in the
  audit outcome view, with a safe actor/action/resource reference. Do not log
  unauthenticated traffic as ordinary organization audit history; route it to security
  monitoring if needed.

**Exit checks:** table is compact and responsive; details are human-readable; user
errors appear as warnings and application failures as errors; historical records are
success/info; failure capture is tested without leaking secrets or producing
success-shaped fallback behavior; admin access, filters, pagination, and audit
immutability remain intact.

---

## 9. Phase 6 — Compact asset filters (request 6)

- Apply the Phase 0 `Filter by` control and chips to
  [src/app/(dashboard)/assets/page.tsx](../src/app/(dashboard)/assets/page.tsx).
- Retain the existing filters and semantics: search, category, availability, member,
  project, location, sort, and pagination.
- Reuse `assetFilterWhere`; do not fork its behavior into a new client-side filtering
  implementation.
- Ensure removing a chip updates the URL and server results and resets the page when
  necessary.

**Exit checks:** compact closed-by-default filter UI; individually removable chips;
all filter combinations, result counts, sorting, pagination, and clear behavior match
the current server-side query.

---

## 10. Phase 7 — CSV templates and safe imports (request 9)

**Goal:** Let authorized users download a section-specific template, upload a CSV,
preview the proposed changes, and safely create/update applicable records.

### 10.1 Shared import workflow

1. Add file selection and downloadable CSV template to each supported section; retain
   asset paste support if useful for compatibility.
2. Parse and validate headers, types, row count, file size, dates, enum values, and
   relational references on the server.
3. Show a preview with row-level create/update/skip/error results before commit.
4. Require explicit confirmation; do not write data while merely previewing.
5. Write valid batches transactionally where practical; return row-numbered errors and
   created/updated/skipped counts. Never silently accept rejected rows.
6. Use a documented stable matching key per section. Treat blank cells as “leave
   unchanged” during update unless the template explicitly defines a clear operation.
7. Preserve tenant scope, role authorization, validation, metadata-template rules,
   audit events, and all business guards. Do not accept `organizationId` from CSV.
8. Set and document upload/row limits. Never accept credential secrets through CSV.

### 10.2 Candidate sections and matching rules

| Section | CSV scope | Matching rule / constraint |
|---|---|---|
| Projects | Create/update supported project fields | Organization-scoped project code |
| People | Update existing member profile fields | Existing user email in the active organization; additions use invitations |
| Tasks | Create/update task details and assignments | Project code + task number; validate project/member/milestone references |
| Assets | Extend current create flow to file upload, template, preview, and update | Existing organization-scoped asset code |
| Deployments | Create/update deployment details and assignments | Require an existing deployment ID for update; avoid ambiguous natural-key matching |
| Allocations | Create/update weekly project/member allocations | Member + project + Monday week; apply overallocation checks atomically |
| Worklogs/timesheets | In scope: create/update draft or in-progress time records only | Require a stable external row key for repeatable updates; enforce the member's existing write scope; never import submitted/approved state |

Audit logs, reports, dashboard metrics, organization credentials, and account passwords
are not import targets.

### 10.3 Templates

- Provide one downloadable template per applicable section, with required/optional
  columns, allowed values, date formats, matching keys, and one realistic generic
  example row.
- Keep templates aligned with the import validator; tests should fail if headers and
  accepted fields drift apart.
- Use domain-neutral fields and allow configured custom fields only through validated
  flat columns named from human-readable template labels (for example, a clearly
  labeled custom-field column), not a JSON blob or internal metadata key.
- For time records, include only the fields needed for draft/in-progress worklogs.
  Reject rows targeting submitted or approved periods; do not let CSV set review,
  approval, signoff, or audit state.

**Exit checks**

- Each supported section offers a matching template and a tested upload path.
- Invalid files/rows show actionable row numbers and no unexpected partial changes.
- Update behavior matches the documented key; omitted CSV rows never delete records.
- No import can cross organization boundaries, bypass role checks, bypass required
  audit events, or exceed allocation/deployment constraints.
- Member CSV cannot create credentials; worklog imports can create/update only
  draft/in-progress records and cannot submit or approve timesheets.

---

## 11. Phase 8 — Cross-feature verification and documentation

- Add focused tests for filter URL state and query parsing, task board/list parity and
  movement, workflow migration/transition/required-field rules, allocation
  math/ranges/overallocation, audit severity/classification, JSON-free form validation,
  and CSV parsing/preview/upsert behavior.
- Add Playwright coverage for:
  - Sign-out from `/organizations/new`.
  - Filter open/apply/remove/clear and browser back/forward.
  - Board horizontal scrolling, collapse, drag, list toggle, labels, flags, and named
    assignees.
  - Allocation synchronization, date range, success/error feedback, and heatmap refresh.
  - Compact member profile, human-readable audit details, severity indicators, and
    sidebar hover/focus states.
  - Deployment checklist and metadata editing without raw JSON.
  - CSV template download, preview, validation error, and confirmed updates for
    worklogs as well as other supported sections.
- Verify at mobile and desktop viewports and with keyboard-only interaction.
- Run focused ESLint and tests, `npm run typecheck`, `npm test`, relevant Playwright
  tests, Prisma validation/migration checks for workflow, labels/flags, metadata
  sections, worklog external keys, and audit outcomes, and a production build with the
  correct runtime database environment.
- Update directly related docs, especially
  [05_COMPONENT_ARCHITECTURE.md](./05_COMPONENT_ARCHITECTURE.md),
  [04_API_ROUTES.md](./04_API_ROUTES.md), and the CSV import guidance.

**Final exit checks:** every requested workflow is verified in the UI and server/API;
tenant and RBAC tests pass; existing behavior remains intact; no secret values are
added to source or documentation.

---

## 12. Delivery order and dependencies

```text
Phase 0 Compact filters ────────┬─> Task filters / board-list parity
                                 └─> Compact asset filters
Phase 1 Sign-out + shell + forms ──> JSON-free configuration and shell verification
Phase 2 Workflow/labels/flags ─────> Board, list, filter, and form behavior
Phase 3 Allocations ───────────────> Capacity views and CSV allocations
Phase 4 Member profile ────────────> Profile layout tests
Phase 5 Audit log ─────────────────> Outcome/severity migration and API error logging
Phase 6 Assets ────────────────────> Reuse Phase 0 filters
Phase 7 CSV imports ───────────────> Entity validators, workflow, and time-entry rules
All phases ────────────────────────> Phase 8 verification/docs
```

Suggested sequence: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. Complete workflow/status
foundation before task CSV imports. Phase 7 follows the interactive workflows so
imports can reuse their validation, permission, audit, and business-rule behavior
rather than create parallel rules.

### Relative sizing

| Phase | Size | Main risk |
|---|---|---|
| 0 Compact filters | M | Query state and individual chip removal stay consistent across routes |
| 1 Sign-out and shell | S–M | Sidebar hover/focus behavior and responsive width changes |
| 2 Workflow/board/list | XL | Safe workflow migration, transition validation, and mixed project workflows |
| 3 Allocations | L | Multi-week transactional writes and concurrent overallocation |
| 4 Member profile | S | Responsive layout without losing context |
| 5 Audit log | L | Failure classification, audit availability, and safely recording errors |
| 6 Asset filters | S | Preserve existing filter semantics |
| 7 CSV imports | XL | Referential integrity, idempotent time-entry updates, and partial-write prevention |
| 8 Verification/docs | M | Coverage across many UI/API flows |

---

## 13. Decisions confirmed for V3

1. **Audit outcomes:** Capture eligible authenticated failures with severity and a
   category that distinguishes user/input/business-rule issues from application
   malfunction. Warnings represent user errors; errors represent unexpected system
   failures. Keep secrets and raw request/exception data out of the audit record.
2. **CSV scope:** Worklogs/timesheets are included for draft or in-progress records;
   submitted/approved periods cannot be imported or modified through CSV.
3. **Custom task fields:** Template-defined task fields are filterable and configurable
   through normal labeled UI, including named sections and workflow-stage requiredness.
   Users never need to write JSON.
4. **Board/workflow scope:** No sprints, epics, or multiple boards. Include labels,
   flags, project-assignable custom workflows/statuses, status transitions, and
   required fields by workflow status/section on the one shared board.
5. **Non-technical users:** Replace user-facing JSON entry and raw JSON detail views
   with visual forms and human-readable summaries. JSON remains an internal transport
   or persistence format only.

### Implementation decisions

- Workflow definitions are organization-scoped and assignable per project; projects
  without an explicit selection use the organization default.
- The shared board groups work by project workflow and constrains status transitions to
  the task's assigned workflow.
- Audit outcome, severity, and failure category are machine-readable and rendered with
  understandable labels and semantic colors.
- CSV worklog updates use an organization-scoped external key and cannot alter a
  submitted or approved period.

## 14. Explicitly out of scope

- Payments, billing, or currency-specific features.
- A complete Jira clone or data model additions for sprints, epics, automation,
  comments, or multiple boards.
- Importing passwords, authentication tokens, or submitted/approved timesheets.
- CSV-driven deletions or implicit deletion of records omitted from a file.
- New database allocation-range columns; allocations remain weekly records.
- Changing unrelated existing work or overwriting uncommitted changes.

## 15. Delivery and verification record

Implemented V3 behavior includes:

- URL-backed compact filters with removable applied-filter chips across project, people,
  asset, report, audit, and task-board views.
- Sign-out on organization creation, collapsed/hover-expand desktop navigation, compact
  workspace header, and a responsive task board with list mode.
- Organization workflows, configurable status transitions and required fields, project
  workflow assignment, labels, flags, and human-readable custom metadata forms.
- Allocation percentage/hour synchronization, date-range expansion into weekly records,
  transactional capacity checks, and update feedback; compact member profile metrics.
- A compact audit table with outcome/severity/failure classification and authenticated
  failure auditing in the implemented mutation/import paths.
- Template-backed CSV preview/confirm imports for assets, projects, members, tasks,
  deployments, allocations, and worklogs. Imports are tenant-scoped and transactional;
  worklogs cannot alter submitted/approved periods.

Verification run:

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed: 43 tests |
| `npx prisma validate` | Passed |

No live database migration was applied. Production build and browser/Playwright
verification were not run; deployment and interactive behavior should be verified with
the intended Vercel/database environment before release.
