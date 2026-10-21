# Implementation Plan V2 — Delivery Record

> Follow-on to [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (Phases 1–8, delivered).
> This records the approved scope and its implementation. The plan was approved and implemented;
> item 9 (audit-log redesign) remains deliberately deferred.

Governing rules are unchanged: [AGENTS.md](../AGENTS.md), mobile-first, [08_DESIGN.md](./08_DESIGN.md)
tokens, tenant isolation on every query, `createAuditEvent()` on every mutation, domain-specific
data in `metadata`, no payments, Zod on client and server, Playwright verification per phase.

---

## Implementation status

| Phase | Outcome |
|---|---|
| 0 — Access model | Complete: shared capabilities, project membership/leads, reporting-line scope, and role checks |
| 1 — Navigation | Complete: mobile navigation and explicit back links on nested pages |
| 2 — Project work items | Complete: task/milestone editing, sequencing, dependencies, audit events, and scoped mutation rules |
| 3 — Shared board | Complete: organization-wide task visibility with permission-aware changes |
| 4 — People and capacity | Complete: directory, editable allocations, expanded profiles, skills, certifications, and utilization |
| 5 — Timesheets | Complete: daily worklogs, monthly periods, Tempo/team/approval views, reminders, and approval locks |
| 6 — Deployments | Complete: editing, multiple assigned members, conflict refresh, and deployment-presence indicators |
| 7 — Assets | Complete: filters, checkout/return, project/deployment links, and CSV import |
| 8 — Reports | Complete: portfolio timeline and task/project metrics |
| 9 — Hardening | Complete for the delivered scope: additive migrations/backfill, docs, CI, unit and Playwright tests |

Final verification: `npm run typecheck`, `npm run lint`, `npm test` (27 tests), Prisma validation and
migration status, `npm run build`, and `npm run test:e2e` (3 browser tests) passed.

Known limits: Playwright verifies role-based board visibility/mutations, mobile navigation, and
cross-feature workflows, but does not exercise every form through the browser UI. External email
delivery and a production cron scheduler were not exercised. Deployment file attachments are not
implemented; audit-log redesign remains deferred as requested.

---

## 1. What the review found before implementation

Verified against the code, not assumed:

| # | Your observation | Root cause in the code |
|---|---|---|
| 1 | Access "needs rethinking" | Rules are scattered: each route hard-codes a `requireTenantRole("…")`. `MANAGER` can edit *every* project; managers cannot be limited to their own team (timesheet access is "own" or "everyone"); `VIEWER` can read assets/projects org-wide. There is no project-level scoping and no team/reporting structure. |
| 2 | Can't change milestones/tasks | **There is no edit UI.** Milestones and tasks only have *Create* and a *status dropdown* ([milestone-form.tsx](../src/components/forms/milestone-form.tsx), [task-form.tsx](../src/components/forms/task-form.tsx)). Title, dates, description, priority, assignees, hours, delete and reorder cannot be changed from the screen, and the status control is shown only to Managers+ (tasks: assignee as well). |
| 3 | Allocations not editable in Members | The member page lists allocations read-only; editing exists only under `/projects/[id]/allocations`. |
| 4 | Thin profile | `OrganizationMember` has title/discipline/department/phone/location/free-form `skills`; no utilisation graphic, no month timesheet summary. |
| 5–6 | Timesheet model | Weekly grid, **one row per project per week**, Mon–Fri only, no task link, no month view, no team view beyond a manager filter, no reminders. |
| 7 | Deployments | Create + status change only. No edit form. Few fields (location, country, dates, checklist, notes). No presence indicator elsewhere in the app. |
| 8 | Assets | Page has only a free-text search and a category field; no filters, no usage guidance, no assignment/check-out. |
| 10 | No back navigation | Only the project detail page has a back link; every other sub-page lacks one. |
| 11 | Board | None exists. `Task.status` and `TaskAssignment` exist, so the data is ready. |
| 12 | Metrics | Overview shows four counters only. No charts, no Gantt, no portfolio view. |

---

## 2. Decisions made up front (flag any you disagree with)

1. **Keep the five roles** (`OWNER > ADMIN > MANAGER > ENGINEER > VIEWER`). The blueprint forbids custom roles in v1.
   Instead we add **scope** to roles: a *reporting line* (who manages whom) and *project membership*
   (who is on which project, with a project-level `LEAD`/`MEMBER` flag). This answers "who should see/change
   what" without inventing roles. The org-wide board is an explicit transparency exception: every active
   organization member sees all project tasks there; role and project permissions still control mutations.
2. **One permission module.** All rules move into `src/lib/permissions.ts` as named capabilities
   (`task.update`, `timesheet.approve`, …) evaluated against `(actor, resource)`. Routes, server pages and
   UI guards all call it — no more inline role literals. This is the single source of truth and is unit-tested.
3. **Rename "Members" → "People".** "Employees" implies HR/payroll and excludes contractors; "People"
   stays generic (white-label rule). Tabs inside: **Directory** and **Allocations**. Alternative if you prefer: "Team & Capacity". Routes move to `/people` with redirects from `/members`.
4. **Timesheets become daily worklogs** (Jira/Tempo model) with a monthly period for submit/approve. The
   old weekly rows are migrated, not dropped.
5. **Gantt/board are built in-house** (CSS grid + existing `@dnd-kit`); charts use one small library
   (**Recharts**) — the only new runtime dependency, justified by item 12. Gantt avoids a heavy third-party package.
6. **Audit log untouched** (item 9). New mutations still write audit events as required by BR-06.

---

## 3. Phase 0 — Access model rethink (foundation for everything else)

**Goal:** a written, testable "who can do what", enforced in one place.

### 3.1 Proposed capability matrix

`●` = allowed, `◐` = allowed on own/scoped records only, `—` = no.
"Scoped" = projects the actor leads or belongs to, or members who report to the actor.

| Capability | Viewer | Engineer | Manager | Admin | Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Open shared organization-wide board and see all project tasks | ● | ● | ● | ● | ● |
| See project dashboards/details | ◐ | ◐ | ● (scoped) | ● | ● |
| See org-wide portfolio & reports | — | — | ● (scoped) | ● | ● |
| Create project | — | — | ● | ● | ● |
| Edit / archive project | — | — | ◐ lead or creator | ● | ● |
| Create / edit / delete milestone | — | — | ◐ project lead | ● | ● |
| Approve milestone sign-off | — | — | ◐ project lead | ● | ● |
| Create task | — | ◐ own projects | ● scoped | ● | ● |
| Edit task details (title, dates, assignees) | — | ◐ own tasks (limited fields) | ● scoped | ● | ● |
| Move task status on board | — | ◐ own tasks | ● scoped | ● | ● |
| Log own time | — | ● | ● | ● | ● |
| See team time / approve | — | — | ◐ direct+indirect reports | ● | ● |
| Edit allocations | — | — | ◐ scoped | ● | ● |
| View people directory | ◐ names only | ● | ● | ● | ● |
| Edit own profile | ◐ | ● | ● | ● | ● |
| Edit others' profile / role | — | — | ◐ profile only | ● | ● |
| Create / edit deployments | — | — | ● scoped | ● | ● |
| See "on deployment" tag | ● | ● | ● | ● | ● |
| Manage assets / check-out | — | ◐ request | ● | ● | ● |
| Invite members, metadata templates | — | — | — | ● | ● |
| Org settings, audit log | — | — | — | ● | ● (delete/transfer: owner) |

> Open points for you (defaults used if unanswered): may **Viewers** see other people's allocation data?
> (default: no); may **Engineers** create tasks? (default: yes, only in projects they belong to).

### 3.2 Work items
- Schema: `OrganizationMember.reportsToMemberId` (self-relation, composite tenant key like the others),
  new `ProjectMember` (`projectId`, `memberId`, `projectRole` = `LEAD | MEMBER`), `Project.leadMemberId`.
- `src/lib/permissions.ts`: capability table + `can(ctx, capability, resource?)`; helper to resolve a
  manager's report tree (recursive CTE via Prisma raw is **not** allowed → compute in app with an org-scoped
  fetch; reporting trees are small).
- Replace inline `requireTenantRole` literals route by route with `requireCapability(...)`; keep
  `roleAtLeast` only inside the permission module.
- Settings → **Teams & access**: Admin screen to set each person's manager and project membership
  (also available inline on the profile and project pages).
- Docs: add the matrix to `04_API_ROUTES.md` and `AGENTS.md §5` (currently incomplete).

**Exit checks:** unit tests for every capability × role × (scoped / unscoped); Playwright as Viewer,
Engineer, Manager, Admin, Owner proves the matrix; no route retains an inline role literal.

---

## 4. Phase 1 — Navigation and back-navigation (item 10)

- New `<BackLink href label />` in `src/components/layout/` and a `PageHeader` (title, breadcrumb trail,
  back link, actions). Applied to every nested page: project detail/settings/allocations, member profile,
  timesheet detail/new, deployment detail/new/edit, asset detail/new/edit, settings sub-pages.
- Breadcrumbs on ≥ `md`, single "← Parent" link on mobile (44 px target).
- Back link uses the explicit parent route (not `history.back()`), so deep links work.
- Navigation re-order and rename:
  `Overview · Projects · Board · People · Timesheets · Deployments · Assets · Reports · Settings`
  (Audit log stays under Settings for now — item 9).
- Mobile: bottom-sheet menu keeps the same items, with role-based visibility from the permission module.

**Exit checks:** Playwright walks every sub-page and returns via the back link on 390 px and 1280 px.

---

## 5. Phase 2 — Projects: editable milestones and tasks (item 2)

**Goal:** anyone with the capability can really *change* work items, with a clear reason when they cannot.

- **Edit drawers** (side panel on desktop, full-screen sheet on mobile) for milestones and tasks:
  title, description, dates, priority, estimate, assignees, milestone link, required discipline,
  metadata fields, delete (with confirm).
- Inline quick actions on the lists (status, assignee, due date) preserved.
- Milestone: add `startDate` (needed for Gantt), reorder (`sequenceNumber`), sign-off controls with the
  BR-04 gate unchanged.
- Task: add `reporterMemberId`, `sortOrder` (rank within a column for the board), `startDate`,
  optional `parentTaskId`/`blockedByTaskId` (dependency — enables Gantt arrows later), human key
  `PRJ-42` (`Project.taskCounter`).
- Read-only users see a visible lock and tooltip: "Only the project lead or a manager can edit this."
- API: complete `PATCH`/`DELETE` for milestones and tasks through the permission module; optimistic
  concurrency using `updatedAt` to stop silent overwrites.
- Task comments / activity feed: **out of scope** (note for later).

**Exit checks:** every field editable by an allowed role; denied roles get 403 *and* a clear UI state;
audit events for every change; Playwright edits, reorders and deletes as Manager/Engineer/Viewer.

---

## 6. Phase 3 — Shared, organization-wide Jira-style board (item 11)

- `/board` is the primary, shared board for the **entire organization**, not a board limited to the
  selected project or the signed-in member's assignments. Every active member, including Viewers, can
  open the same board and see every task from every project. No task is hidden because of its project,
  assignee, or the viewer's role. Project details can remain scoped separately under Phase 0.
- The project filter is a way to focus the shared board, not a security or visibility boundary. The
  unfiltered default shows all organization tasks. Include project key/name on each card so cross-project
  work is clear; support search and filtering across project, status, assignee, milestone, priority and
  due date, plus swimlanes by project or assignee.
- Columns map to `TaskStatus` (Backlog, In progress, Under review, Approved, Completed, Cancelled);
  the same columns and statuses are shared across projects in v1.
- Cards show the useful Jira-style task context supported by the schema: key, title, project, status,
  assignee avatars, priority, due date (overdue highlight), milestone, estimate/actual hours,
  discipline-mismatch warning (BR-02, non-blocking), and "on deployment" tag for assignees (Phase 6).
  Additional Jira-style fields such as labels, epics and issue types are not in the current schema and
  are not silently implied by this board scope; add them only in a separately agreed follow-up.
- Drag and drop with `@dnd-kit/core` (already installed) and keyboard sensor; server confirms; failure
  rolls the card back with an inline error. Board visibility is the same for all roles; edit/move controls
  are permission-aware, and cards the user cannot change are visibly read-only, not hidden.
- Filters: project, status, assignee, milestone, priority, due date, "my tasks"; swimlane toggle by
  project or assignee. Filters never remove the user's ability to clear back to the full shared board.
- Mobile: single-column swipe between status tabs with a "Move to…" menu (drag is unreliable on phones).
- Quick-create at the bottom of a column; click opens the Phase 2 task drawer.
- Rank-based ordering (`sortOrder` using fractional ranks) so reordering writes one row.

**Exit checks:** every active role sees the same full organization task set and totals when unfiltered;
project filters only narrow the view and clear restores all tasks; permitted moves persist, denied moves
are rejected by the API, Viewer sees the same tasks read-only; concurrent moves resolve without duplicates.

---

## 7. Phase 4 — People: directory, allocations, richer profile (items 3, 4)

### 7.1 "People" section
- Tabs: **Directory** (cards/table, search, filter by role, discipline, team, availability) and
  **Allocations** (member × week grid, replaces the read-only list).
- **Inline allocation editing** in the Allocations tab and on the profile: click a cell to set hours/% per
  project, with the existing `OVERALLOCATION` guard (BR-01), concurrency lock and audit. Allowed for roles
  per the Phase 0 matrix; read-only otherwise. Heatmap extended to 4–12 week range selector.

### 7.2 Profile (item 4)
Top of the profile — a **utilisation panel**:
- Radial/segmented bar for the selected week and a 12-week sparkline: allocated vs. capacity, overallocation in the reserved red pulse style.
- **This month's timesheet**: logged vs. expected (working days × daily capacity) with remaining hours,
  split by project; days still empty highlighted; link to the month sheet.
- Next/current deployment and the "on deployment" tag.

Additional profile data (stored as typed columns where it is generic, otherwise `metadata`):
- `bio`, `employmentType` (employee / contractor / intern), `startDate`, `timezone`, `workingDays`,
  `dailyCapacityHrs`, `reportsToMemberId`, `emergencyContactName/Phone` (visible to Admin only).
- **Skills** become structured: `MemberSkill(memberId, name, level 1–5, yearsExperience)`; **certifications**
  (name, issuer, expiry with expiry warnings); languages; preferred work mode.
- Org-configurable extra fields continue to come from `MetadataTemplate` (so "licence number",
  "clearance level", etc. stay out of the schema).
- Skill-based search in the Directory and in allocation pickers ("who has welding level ≥ 3 and is free?").

**Exit checks:** edit allocation in place as Manager and Admin, blocked beyond 100 %; profile
numbers match the underlying records; sensitive fields hidden from non-Admins.

---

## 8. Phase 5 — Timesheets: month-wise, Jira/Tempo style (items 5, 6)

### 8.1 Data model (replaces weekly-per-project rows)
- `Worklog`: `memberId`, `projectId`, optional `taskId`, `date`, `hours`, `description`, `billable`
  *(a generic flag, no currency)*.
- `TimesheetPeriod`: `memberId`, `month`, `status` (`OPEN | SUBMITTED | APPROVED | REOPENED`),
  `submittedAt`, `approvedByMemberId`, `approvedAt`, `reviewNotes`.
- Rules: ≤ 24 h/day total, no future dates beyond a configurable window, locked after approval
  (reopen by approver, audited). The existing `TimesheetEntry` is migrated into worklogs (one per
  weekday/hour value) by a reversible migration script; old table kept until verified.
- Totals are always computed server-side.

### 8.2 Tabbed UI (Time page)
1. **My timesheet** — month grid like Jira: rows = projects/tasks the user is assigned to (plus
   "add row" to log against any accessible task), columns = days of the month, row/column totals,
   weekends shaded, expected vs. logged footer, month picker and prev/next. Mobile: day list with a
   quick "Log time" sheet (task picker, hours, note) instead of a wide grid.
2. **Tempo view** — the *planned vs. logged* view: per-person rows, per-day cells, planned hours from
   allocations vs. logged; also a **by project**, **by task** pivot with the same month navigation, and
   CSV export. Tab visibility depends on role.
3. **Team** (Manager+) — everyone in the actor's report tree for the chosen month: status chips,
   progress bars, missing days, bulk approve/reject with a note, drill into any person's sheet, and
   "log on behalf" for Admin only (audited).
4. **Approvals** (Manager+) — queue of submitted periods.

### 8.3 Reminders (item 6)
- In-app alert banner + bell with count: "You have 3 unlogged working days" and "Timesheet for October
  is due". Managers see "4 people haven't submitted".
- `Notification` table (`memberId`, `type`, `payload`, `readAt`) and a **Remind** button on the Team tab
  (manual) plus an optional scheduled job (`/api/cron/timesheet-reminders`, protected by a secret)
  for e-mail via the existing Resend/SMTP layer. Org settings: reminder day/time, grace period.
- E-mail delivery is only as good as the configured provider (still unverified in this environment).

**Exit checks:** log across a month incl. weekends; submit → approve → lock; manager sees only
their reports; Admin override audited; mobile quick-log works; reminder appears and clears.

---

## 9. Phase 6 — Deployments: edit, presence tag, richer data (item 7)

- **Edit** page/drawer for every field plus status (`UPCOMING / ACTIVE / COMPLETED / CANCELLED`), with
  conflict flags recomputed on every change (BR-03) and an audit trail.
- **New fields** (typed where generic; others via `metadata` template): `title`, `type`
  (on-site, remote, commissioning, training, audit…), `site name`, `address`, `country`, `timezone`,
  `siteContactName/Phone`, `reportingManagerMemberId`, `travelMode`, `travelDetails`,
  `accommodation`, `purpose/scope`, `deliverables`, `riskNotes`, `requiredEquipment` (links to Assets),
  `emergencyInfo`, checklist with per-item completion and owner, attachments *(storage provider is not
  yet implemented — placeholder for links)*.
- **Multiple members per deployment** (`DeploymentMember` join) instead of one member per row.
- **"On deployment" tag** — computed from active deployments covering *today*: shown on the member card,
  profile, board cards, allocation grid, timesheet team list and assignee pickers, with tooltip
  "On deployment at {site} until {date}". Visible to every role. Also surfaced as a "Currently deployed"
  widget on Overview.
- Status auto-advance (UPCOMING → ACTIVE on start date) via the same daily job as the reminders, with
  manual override.
- Calendar/timeline view of deployments alongside the list.

**Exit checks:** edit every field; tag appears/disappears with date and status; overlapping allocation
conflict updates after edit; viewer sees the tag but cannot edit.

---

## 10. Phase 7 — Assets: usable and filterable (item 8)

- Filters: category, status (Available / In use / Maintenance / Retired), assigned person, linked
  project, location, text search; saved filters via URL params; sort and pagination.
- Category list is org-managed (suggested from existing values + `MetadataTemplate` for category-specific
  fields such as "calibration due").
- Add `assignedMemberId`, `location`, `serialNumber`, `acquiredOn`, `nextServiceDate`; **check out / return**
  action that records who holds it and for which project/deployment; availability shown on cards.
- **"How to use" onboarding:** empty/short-list state explains *what an asset is*, with one-click
  "Add your first asset", an example-category picker, and a short inline help panel; contextual hints
  on the detail page ("Link to a project", "Check out").
- Bulk CSV import (name, category, status, location) to populate quickly.

**Exit checks:** every filter combination narrows results correctly and survives refresh; checkout
updates availability; tenant isolation retained.

---

## 11. Phase 8 — Reports & insights for upper management (item 12)

New top-level **Reports** section (visible Manager+ for scoped data, Admin/Owner org-wide):

1. **Executive summary** — health by project (on track / at risk / late via due dates and
   completion %), counts, and top risks.
2. **Portfolio Gantt** — projects → milestones → tasks on a month/quarter timeline, today line,
   progress fill, dependency arrows, filter by team/status; zoom controls; read-only for most roles.
3. **Task metrics** — burn-up/burn-down, throughput per week, cycle time, status distribution, overdue
   and aging tasks, estimate vs. actual hours.
4. **Capacity & utilisation** — org/team utilisation over time, overallocated and under-utilised people,
   forecast of free capacity by discipline for the next 12 weeks.
5. **Time insights** — hours by project/task/member, planned vs. logged variance, submission compliance.
6. **Deployments** — who is deployed where, upcoming/overlapping, utilisation impact.
7. **Assets** — in use vs. available, maintenance due.
- Date-range, project, team and discipline filters; every chart has a data-table fallback, accessible
  labels, mobile-friendly stacking and print/CSV export.
- Server-side aggregation (Prisma `groupBy`) with tenant scoping and indexes; cached for 60 s;
  no raw SQL.
- The existing Overview becomes a personal "My work" landing (my tasks, my hours, my deployments,
  reminders), while Reports serves management.

**Exit checks:** numbers reconcile with source records on a seeded dataset; roles see only permitted
scopes; charts readable on 390 px.

---

## 12. Phase 9 — Hardening, migration, verification

- Prisma migrations are additive and reversible; backfill scripts for `TimesheetEntry → Worklog`, task
  keys, `Project.lead`, `ProjectMember`, and ranks. Run on a backup first.
- Seed script (dev only) with realistic multi-role sample data so every screen and chart can be reviewed.
- Test coverage: unit tests (permissions, month totals, overallocation, rank ordering, deployment
  overlap), API integration tests for tenant isolation per new endpoint, Playwright journeys per role
  on phone and desktop. Add a committed Playwright suite (none exists today) wired into CI.
- Accessibility pass (keyboard board movement, chart tables, focus management in drawers).
- Update docs: `03_PRISMA_SCHEMA.md`, `04_API_ROUTES.md`, `05_COMPONENT_ARCHITECTURE.md`,
  `02_DIRECTORY_TREE.md`, README, and the permission matrix.
- Revisit remaining `npm audit` advisories and the five ESLint warnings noted earlier.

---

## 13. Delivery order and dependencies

```
Phase 0 Access ─┬─> Phase 1 Navigation
                ├─> Phase 2 Milestone/Task editing ─> Phase 3 Board ─┐
                ├─> Phase 4 People/Allocations ──────────────────────┤
                ├─> Phase 5 Timesheets (needs Phase 0 team tree) ────┼─> Phase 8 Reports
                ├─> Phase 6 Deployments (tag used by 3,4,5) ─────────┤
                └─> Phase 7 Assets ──────────────────────────────────┘
                                                   Phase 9 Hardening (continuous, final gate)
```

Suggested sequence: **0 → 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9**. Phase 6 precedes 5 so the deployment tag
is available in the timesheet team view; Phase 5 is the largest and riskiest (data migration).

### Rough sizing (relative)
| Phase | Size | Main risk |
|---|---|---|
| 0 Access | M | Rewriting every route's guard without regressions |
| 1 Navigation | S | — |
| 2 Milestone/Task edit | M | Optimistic concurrency, Gantt-ready fields |
| 3 Board | M | Drag/drop accessibility and mobile UX |
| 4 People | L | Inline allocation editing + concurrency |
| 5 Timesheets | XL | Migration, month grid on mobile, reminders |
| 6 Deployments | L | Multi-member model, conflict recompute |
| 7 Assets | S–M | Defining "usage" clearly |
| 8 Reports | L | Aggregation correctness/performance |
| 9 Hardening | M | Test infrastructure |

---

## 14. Defaults used and possible follow-up decisions

1. Section name: **People**. It avoids implying HR/payroll and supports employees and contractors.
2. Viewers do not see team allocation or timesheet data.
3. Worklogs support project/task time and non-project categories; no billing or currency was added.
4. Reminders are in-app; email delivery requires a configured provider and has not been verified here.
5. One reporting manager per person.
6. Board columns use the shared task status set; there are no per-project workflows.
7. Task dependencies are represented in the schema; the board does not add Jira-only issue types or epics.
8. Deployment attachments remain out of scope until a storage provider is selected.

---

## 15. Explicitly out of scope
Audit-log redesign (item 9, next phase), payments/billing, custom roles, task comments/mentions,
third-party calendar/Jira sync, native mobile apps, SSO beyond the existing Google option.
