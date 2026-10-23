# 04 — API Routes & Business Logic

> Complete REST endpoint catalog with tenant-isolation middleware,
> request/response contracts, and authorization rules.

---

## Tenant Isolation Middleware

Every API route handler **must** begin with `withTenantContext()`.
This function resolves the `organizationId` from the session and returns a
Prisma-compatible filter that is merged into every query.

```typescript
// src/lib/tenant.ts

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: MemberRole;
}

/**
 * Extracts and validates the authenticated tenant context.
 * Returns 401 if no session, 403 if session lacks an org.
 */
export async function resolveTenantContext(
  req: NextRequest
): Promise<TenantContext | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  return {
    organizationId: session.user.organizationId,
    userId: session.user.id,
    role: session.user.role as MemberRole,
  };
}

/**
 * Asserts the authenticated user has at least the required role.
 * Throws 403 if insufficient.
 */
export function requireRole(ctx: TenantContext, minimum: MemberRole): NextResponse | null {
  const hierarchy: MemberRole[] = ["VIEWER", "ENGINEER", "MANAGER", "ADMIN", "OWNER"];
  const userLevel = hierarchy.indexOf(ctx.role);
  const requiredLevel = hierarchy.indexOf(minimum);

  if (userLevel < requiredLevel) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  return null;
}
```

---

## Standard Response Envelope

All endpoints return a consistent JSON envelope:

```typescript
// Success
{
  "data": <T>,
  "meta": {                     // Present on paginated responses
    "total": 120,
    "page": 1,
    "pageSize": 20
  }
}

// Error
{
  "error": "Human-readable message",
  "code": "VALIDATION_ERROR",   // Optional machine-readable error code
  "field": "title"              // Optional: which field failed (for form validation)
}
```

---

## Projects

### `GET /api/projects`
List all projects for the authenticated organization.

**Query params**: `status`, `search`, `page` (default 1), `pageSize` (default 20), `sortBy`, `sortDir`

**Auth**: Any authenticated member.

**Handler skeleton**:
```typescript
export async function GET(req: NextRequest) {
  const ctx = await resolveTenantContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Number(searchParams.get("pageSize") ?? 20);

  const where = {
    organizationId: ctx.organizationId,
    ...(status && { status: status as ProjectStatus }),
    ...(search && { title: { contains: search, mode: "insensitive" } }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { milestones: { select: { id: true, status: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.count({ where }),
  ]);

  return NextResponse.json({ data: projects, meta: { total, page, pageSize } });
}
```

---

### `POST /api/projects`
Create a new project.

**Auth**: MANAGER or above.

**Request body**:
```json
{
  "title": "Highway Bridge Retrofit",
  "description": "Phase 2 structural assessment...",
  "code": "PRJ-0042",
  "startDate": "2026-11-01",
  "endDate": "2027-06-30",
  "budgetHours": 2400,
  "metadata": {
    "stressLoadVectors": "450 kN/m²",
    "materialGrade": "A572"
  },
  "tags": ["structural", "retrofit"]
}
```

**Response**: `201 Created` with created project.

---

### `GET /api/projects/[projectId]`
Get a single project by ID, including milestones and allocation summary.

**Auth**: Any member. VIEWER must be explicitly granted access (future v2 feature; in v1 all org members can read all projects).

**Guards**: `project.organizationId === ctx.organizationId` (enforced in query).

---

### `PATCH /api/projects/[projectId]`
Partial update — supports all writable fields including `metadata`.

**Auth**: MANAGER or above.

**Audit**: Creates `AuditLog` record with `before`/`after` snapshots.

---

### `DELETE /api/projects/[projectId]`
Soft-delete by setting `status = ARCHIVED`. Hard delete requires OWNER role.

**Auth**: ADMIN or above for archive; OWNER for hard delete.

---

## Milestones

### `GET /api/projects/[projectId]/milestones`
All milestones for a project, ordered by `sequenceNumber`.

### `POST /api/projects/[projectId]/milestones`
**Auth**: MANAGER+. Body includes `title`, `targetDate`, `requiresSignoff`, `metadata`.

### `PATCH /api/projects/[projectId]/milestones/[milestoneId]`
Update status, completionPct, or signoff.

**Business rule — Signoff gate**:
```typescript
if (body.status === "APPROVED" && milestone.requiresSignoff) {
  if (!body.signoffByMemberId) {
    return NextResponse.json(
      { error: "Signoff required before approving this milestone", code: "SIGNOFF_REQUIRED" },
      { status: 422 }
    );
  }
}
```

---

## Tasks

### `GET /api/projects/[projectId]/tasks`
Query params: `milestoneId`, `status`, `assignedTo`, `priority`.

### `POST /api/projects/[projectId]/tasks`
Creates task, optionally assigns members immediately via `assigneeIds[]`.

### `PATCH /api/projects/[projectId]/tasks/[taskId]`
Update status, priority, estimates. Triggers `AuditLog` on status transitions.

---

## Members

### `GET /api/members`
Returns all `OrganizationMember` records for the org.

Query params: `role`, `discipline`, `search`, `isActive`.

**Auth**: ENGINEER+ (can see all org members).

### `POST /api/members/invite`
Send invitation email and create `Invitation` record.

**Auth**: ADMIN+.

**Request body**:
```json
{
  "email": "jane.doe@example.com",
  "role": "ENGINEER",
  "title": "Senior Structural Engineer"
}
```

**Business logic**:
1. Check if email already has an active `OrganizationMember` record → return 409.
2. Check if a pending `Invitation` exists → return 409.
3. Create `Invitation` row with 7-day expiry.
4. Send invite email via configured email provider.

### `PATCH /api/members/[memberId]`
Update title, discipline, role, capacityHrs, metadata.

**Auth**: ADMIN+ for role changes; MANAGER+ for other fields; ENGINEER can update own profile.

### `DELETE /api/members/[memberId]`
Deactivates membership (`isActive = false`). Does not delete the User record.

**Auth**: ADMIN+. Cannot deactivate an OWNER.

---

## Resource Allocations

### `GET /api/projects/[projectId]/allocations`
Returns weekly allocation grid for all members on this project.

Query params: `weekStart`, `weekEnd`, `memberId`.

### `POST /api/projects/[projectId]/allocations`
**Auth**: MANAGER+.

**Business rule — Capacity check**:
```typescript
// Fetch all allocations for the member in the same week
const weeklyTotal = await prisma.resourceAllocation.aggregate({
  where: {
    memberId: body.memberId,
    organizationId: ctx.organizationId,
    weekStartDate: body.weekStartDate,
  },
  _sum: { allocationPct: true },
});

const newTotal = (weeklyTotal._sum.allocationPct ?? 0) + body.allocationPct;
if (newTotal > 100) {
  return NextResponse.json(
    {
      error: `Allocation would exceed 100% capacity (current: ${weeklyTotal._sum.allocationPct}%)`,
      code: "OVERALLOCATION",
    },
    { status: 422 }
  );
}
```

---

## Timesheets

### `GET /api/timesheets`
**Auth**: ENGINEER sees only their own. MANAGER+ sees all org timesheets.

Query params: `memberId`, `weekStart`, `weekEnd`, `status`.

### `POST /api/timesheets`
Creates or upserts a weekly timesheet entry.

Automatically computes `totalHrs = monday + tuesday + wednesday + thursday + friday`.

### `PATCH /api/timesheets/[timesheetId]`
**Submit**: `{ status: "SUBMITTED" }` — ENGINEER only.

**Approve**: `{ status: "APPROVED", approvedByMemberId: "..." }` — MANAGER+.

**Flag**: `{ status: "FLAGGED" }` — MANAGER+.

---

## Deployments

### `GET /api/deployments`
**Auth**: Any member. Returns all deployments for the org.

Query params: `memberId`, `projectId`, `status`, `from`, `to`.

### `POST /api/deployments`
**Auth**: MANAGER+.

**Business rule — Office capacity freeze**:
```typescript
// When a deployment is created, flag overlapping in-office allocations
const conflictingAllocations = await prisma.resourceAllocation.findMany({
  where: {
    memberId: body.memberId,
    organizationId: ctx.organizationId,
    weekStartDate: { gte: body.startDate, lte: body.endDate },
    mode: "Remote", // in-office allocations conflict with on-site deployments
  },
});

// Store conflict list in deployment.conflictFlags JSON
```

---

## Assets

### `GET /api/assets`
Query params: `category`, `search`, `projectId`.

### `POST /api/assets`
Creates a generic asset with `assetCode`, `title`, `category`, and open `metadata` JSON.

### `PATCH /api/assets/[assetId]`
Update any field including metadata.

### `POST /api/assets/[assetId]/link-project`
Links asset to a project via `ProjectAsset` join.

---

## Audit Log

### `GET /api/audit-log`
**Auth**: ADMIN+ only.

Query params: `entityType`, `entityId`, `actorId`, `from`, `to`, `page`, `pageSize`.

Returns paginated, immutable audit trail. **No POST/PATCH/DELETE** routes exist for this resource.
Each row reports `outcome`, `severity`, and (for failures) `failureCategory`, `errorCode`,
and a safe summary. Eligible authenticated mutation/import failures are recorded as audit
events; unexpected request errors are classified as application errors when tenant
context can be resolved.

---

## Metadata Templates

### `GET /api/metadata-templates`
Query params: `entityType` (filters to project/asset/member/milestone templates).

### `POST /api/metadata-templates`
**Auth**: ADMIN+.

**Request body**:
```json
{
  "entityType": "project",
  "name": "Structural Engineering Fields",
  "fields": [
    {
      "key": "stressLoadVectors",
      "label": "Stress Load Vectors",
      "type": "text",
      "required": false,
      "order": 1
    },
    {
      "key": "designCode",
      "label": "Design Code",
      "type": "select",
      "options": ["AISC 360", "ACI 318", "EN 1993"],
      "required": true,
      "order": 2
    }
  ],
  "isDefault": true
}
```

### `PATCH /api/metadata-templates/[templateId]`
Update fields array. Does not retroactively validate existing `metadata` JSON on entities.

---

## Revised access scope and workflow endpoints

Access is enforced through `src/lib/permissions.ts`; `src/lib/rbac.ts` retains the same
role hierarchy for presentation checks. Every endpoint still derives `organizationId` from
the authenticated tenant context.

| Capability | Who can do it |
|---|---|
| `board.read` | Every active organization member sees all tasks across all projects; filters are not security boundaries |
| `project.read` | Project members/leads; Admin and Owner organization-wide |
| `project.update`, milestone create/update | Project leads; Admin and Owner organization-wide |
| `task.create` | Engineer+ in a project they belong to |
| `task.update` | Manager+ in a project they belong to |
| `task.move` | Manager+ in scoped projects; Engineers only on tasks assigned to them |
| `timesheet.log` | Engineer+ for self |
| `timesheet.team`, `timesheet.approve` | Manager in direct/indirect reporting tree; Admin/Owner organization-wide; self-approval is denied |
| `allocation.update` | Manager within project and team scope; Admin/Owner organization-wide |
| `profile.update` | Any role may update own profile; Managers may manage reports |
| `role.manage`, `settings.manage`, `audit.read` | Admin and Owner; ownership transfer/deactivation remains Owner-only |

Additional workflow routes:

| Method and route | Purpose |
|---|---|
| `GET /api/projects/[projectId]/members` | Read project member/lead assignments with project scope |
| `PUT /api/projects/[projectId]/members` | Replace active project members/leads; requires at least one lead and audits changes |
| `GET /api/board/tasks` | Query the shared organization task set with project, assignee, status, priority, milestone, due-date, and text filters |
| `GET /api/worklogs` / `POST /api/worklogs` | Read a monthly daily-worklog range; create self entries, or Admin log-on-behalf |
| `PATCH /api/worklogs/[worklogId]` / `DELETE /api/worklogs/[worklogId]` | Edit/delete own unlocked entries; Admin may edit another person's |
| `PATCH /api/timesheet-periods/[periodId]` | Submit, approve, or reopen a month; totals remain server-computed |
| `POST /api/timesheet-reminders` | Create a team-scoped in-app timesheet reminder |
| `PATCH /api/notifications/[notificationId]` | Mark the current member's notification read |
| `POST /api/assets/[assetId]/checkout` | Check out or return an asset with tenant/member/project/deployment checks |
| `POST /api/assets/import` | Import up to 500 CSV assets in an audited transaction |
| `POST /api/deployments` / `PATCH /api/deployments/[deploymentId]` | Create/edit multi-member deployments and recompute per-member conflicts |
| `GET /api/task-workflows` / `POST /api/task-workflows` | List or create organization workflows and their statuses/transitions |
| `PATCH /api/task-workflows/[workflowId]` / `DELETE /api/task-workflows/[workflowId]` | Update or remove an unused workflow |
| `GET /api/task-labels` / `POST /api/task-labels` | List or create organization task labels |
| `PATCH /api/task-labels/[labelId]` / `DELETE /api/task-labels/[labelId]` | Update or remove a task label |
| `POST /api/{projects,members,tasks,deployments,allocations,worklogs}/import` | Preview and confirm tenant-scoped CSV imports; member imports update existing accounts only and worklogs cannot alter submitted/approved periods |

CSV imports use a preview/confirm contract, validate all rows before transactional writes,
and audit each successful row. Omitted optional CSV values leave existing values unchanged;
worklogs use an organization-scoped external key for stable updates.

The weekly `TimesheetEntry` routes remain for historical compatibility; new time capture
uses `Worklog` and `TimesheetPeriod`. The audit log is a compact table with outcome,
severity, filters, and human-readable event details.

---

## Error Code Reference

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Zod schema validation failed |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Valid session but insufficient role |
| 404 | `NOT_FOUND` | Resource does not exist or belongs to another org |
| 409 | `CONFLICT` | Duplicate resource (unique constraint) |
| 422 | `OVERALLOCATION` | Member capacity exceeded |
| 422 | `SIGNOFF_REQUIRED` | Milestone cannot be approved without signoff |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

*Next: [`05_COMPONENT_ARCHITECTURE.md`](./05_COMPONENT_ARCHITECTURE.md)*
