# 03 — Prisma Schema (Generic Multi-Tenant)

> This is the **authoritative source of truth** for the white-label platform database.
> It completely replaces the current domain-specific schema.
> Every model is isolated by `organizationId`. No company-specific field names exist.

---

## Complete `schema.prisma`

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum MemberRole {
  OWNER
  ADMIN
  MANAGER
  ENGINEER
  VIEWER
}

enum ProjectStatus {
  PLANNING
  ACTIVE
  ON_HOLD
  COMPLETED
  ARCHIVED
}

enum MilestoneStatus {
  PLANNED
  IN_PROGRESS
  UNDER_REVIEW
  APPROVED
  COMPLETED
}

enum TaskStatus {
  BACKLOG
  IN_PROGRESS
  UNDER_REVIEW
  APPROVED
  COMPLETED
  CANCELLED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum TimesheetStatus {
  DRAFT
  SUBMITTED
  APPROVED
  FLAGGED
}

enum DeploymentStatus {
  UPCOMING
  ACTIVE
  COMPLETED
  CANCELLED
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
  LOGIN
  INVITE
  ROLE_CHANGE
  EXPORT
}

// ─────────────────────────────────────────────
// MULTI-TENANCY ROOT
// ─────────────────────────────────────────────

model Organization {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique               // URL-safe identifier, e.g. "acme-engineering"
  logoUrl     String?                        // Overridable per-org branding asset
  website     String?
  industry    String?                        // Descriptive only — "Structural", "Software", etc.
  timezone    String   @default("UTC")
  locale      String   @default("en-US")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members             OrganizationMember[]
  projects            Project[]
  assets              Asset[]
  metadataTemplates   MetadataTemplate[]
  deployments         Deployment[]
  auditLogs           AuditLog[]
  integrations        Integration[]

  @@index([slug])
}

// ─────────────────────────────────────────────
// USERS & AUTH
// ─────────────────────────────────────────────

model User {
  id             String   @id @default(uuid())
  email          String   @unique
  emailVerified  DateTime?
  passwordHash   String?                     // Null when using OAuth only
  name           String?
  avatarUrl      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  memberships    OrganizationMember[]
  accounts       Account[]                   // OAuth accounts (Auth.js)
  sessions       Session[]                   // Auth.js sessions

  @@index([email])
}

// Auth.js required models
model Account {
  id                String  @id @default(uuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expires      DateTime
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// Org membership with per-org role
model OrganizationMember {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           MemberRole   @default(ENGINEER)
  title          String?                         // Job title within this org
  discipline     String?                         // Engineering discipline (free text, domain-agnostic)
  department     String?
  phone          String?
  location       String?
  skills         Json?                           // Array of skill tags
  capacityHrsPerWeek Float    @default(40.0)     // Configurable base capacity
  metadata       Json?                           // Domain-specific member fields
  isActive       Boolean      @default(true)
  invitedAt      DateTime?
  joinedAt       DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  allocations        ResourceAllocation[]
  timesheetEntries   TimesheetEntry[]
  deployments        Deployment[]
  taskAssignments    TaskAssignment[]

  @@unique([organizationId, userId])
  @@index([organizationId])
  @@index([userId])
}

// ─────────────────────────────────────────────
// INVITE SYSTEM
// ─────────────────────────────────────────────

model Invitation {
  id             String     @id @default(uuid())
  organizationId String
  email          String
  role           MemberRole @default(ENGINEER)
  token          String     @unique @default(uuid())
  expiresAt      DateTime
  acceptedAt     DateTime?
  invitedById    String                          // userId of inviter
  createdAt      DateTime   @default(now())

  @@index([organizationId])
  @@index([token])
}

// ─────────────────────────────────────────────
// DYNAMIC METADATA TEMPLATES
// ─────────────────────────────────────────────

// Defines custom fields for an entity type within an org
model MetadataTemplate {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  entityType     String       // "project" | "asset" | "member" | "milestone"
  name           String       // e.g. "Structural Project Fields"
  fields         Json         // Array of MetadataFieldDefinition (see types/metadata.ts)
  isDefault      Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([organizationId, entityType])
}

// ─────────────────────────────────────────────
// PROJECTS (Primary Work Unit)
// ─────────────────────────────────────────────

model Project {
  id             String        @id @default(uuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  code           String                          // Org-unique project code (e.g. PRJ-0042)
  title          String
  description    String?       @db.Text
  status         ProjectStatus @default(PLANNING)
  startDate      DateTime?
  endDate        DateTime?
  budgetHours    Float?                          // Estimated total hours
  actualHours    Float         @default(0.0)    // Running sum updated via trigger/server action
  metadata       Json?                           // Domain-specific fields from MetadataTemplate
  tags           String[]      @default([])
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  milestones         Milestone[]
  tasks              Task[]
  allocations        ResourceAllocation[]
  timesheetEntries   TimesheetEntry[]
  deployments        Deployment[]
  assets             ProjectAsset[]

  @@unique([organizationId, code])
  @@index([organizationId])
  @@index([organizationId, status])
}

// ─────────────────────────────────────────────
// MILESTONES
// ─────────────────────────────────────────────

model Milestone {
  id                 String          @id @default(uuid())
  organizationId     String
  projectId          String
  project            Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sequenceNumber     Int
  title              String
  description        String?         @db.Text
  status             MilestoneStatus @default(PLANNED)
  targetDate         DateTime?
  completionPct      Float           @default(0.0) @db.DoublePrecision // Legacy storage; displayed progress is derived from completed tasks.
  requiresSignoff    Boolean         @default(false)
  signoffByMemberId  String?         // OrganizationMember id of approver
  signoffAt          DateTime?
  metadata           Json?
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  tasks            Task[]
  allocations      ResourceAllocation[]
  timesheetEntries TimesheetEntry[]

  @@index([organizationId])
  @@index([projectId])
}

// ─────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────

model Task {
  id             String       @id @default(uuid())
  organizationId String
  projectId      String
  project        Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  milestoneId    String?
  milestone      Milestone?   @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
  title          String
  description    String?      @db.Text
  status         TaskStatus   @default(BACKLOG)
  priority       TaskPriority @default(MEDIUM)
  estimatedHrs   Float?
  actualHrs      Float        @default(0.0)
  dueDate        DateTime?
  metadata       Json?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  assignments TaskAssignment[]

  @@index([organizationId])
  @@index([projectId])
  @@index([milestoneId])
  @@index([status])
}

model TaskAssignment {
  id       String             @id @default(uuid())
  taskId   String
  task     Task               @relation(fields: [taskId], references: [id], onDelete: Cascade)
  memberId String
  member   OrganizationMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  assignedAt DateTime         @default(now())

  @@unique([taskId, memberId])
}

// ─────────────────────────────────────────────
// RESOURCE ALLOCATION
// ─────────────────────────────────────────────

model ResourceAllocation {
  id             String             @id @default(uuid())
  organizationId String
  memberId       String
  member         OrganizationMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  projectId      String
  project        Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  milestoneId    String?
  milestone      Milestone?         @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
  weekStartDate  DateTime                              // ISO week start (Monday)
  plannedHrs     Float
  allocationPct  Float                                 // 0.0–100.0
  mode           String             @default("Remote") // Remote | On-Site | Hybrid
  notes          String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([organizationId])
  @@index([memberId])
  @@index([projectId])
  @@index([weekStartDate])
}

// ─────────────────────────────────────────────
// TIMESHEETS
// ─────────────────────────────────────────────

model TimesheetEntry {
  id             String             @id @default(uuid())
  organizationId String
  memberId       String
  member         OrganizationMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  projectId      String
  project        Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  milestoneId    String?
  milestone      Milestone?         @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
  weekStartDate  DateTime
  monday         Float              @default(0.0)
  tuesday        Float              @default(0.0)
  wednesday      Float              @default(0.0)
  thursday       Float              @default(0.0)
  friday         Float              @default(0.0)
  totalHrs       Float              @default(0.0)    // Computed on save
  status         TimesheetStatus    @default(DRAFT)
  notes          String?
  approvedByMemberId String?
  approvedAt     DateTime?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([organizationId])
  @@index([memberId])
  @@index([projectId])
  @@index([weekStartDate])
}

// ─────────────────────────────────────────────
// DEPLOYMENTS (Site / Field Assignments)
// ─────────────────────────────────────────────

model Deployment {
  id             String             @id @default(uuid())
  organizationId String
  organization   Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  memberId       String
  member         OrganizationMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  projectId      String
  project        Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  location       String
  country        String?
  startDate      DateTime
  endDate        DateTime
  status         DeploymentStatus   @default(UPCOMING)
  checklist      Json?              // Array of checklist items with completion booleans
  conflictFlags  Json?              // Flagged in-office deliverables during this period
  notes          String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([organizationId])
  @@index([memberId])
  @@index([projectId])
}

// ─────────────────────────────────────────────
// ASSETS (Generic — equipment, documents, tags)
// ─────────────────────────────────────────────

model Asset {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assetCode      String                          // Org-unique identifier
  title          String
  description    String?
  category       String?                         // e.g. "Instrument", "Document", "Equipment"
  status         String       @default("Active")
  metadata       Json?                           // Domain-specific: ISA tags, BIM IDs, etc.
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  projects ProjectAsset[]

  @@unique([organizationId, assetCode])
  @@index([organizationId])
}

model ProjectAsset {
  projectId  String
  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assetId    String
  asset      Asset   @relation(fields: [assetId], references: [id], onDelete: Cascade)
  linkedAt   DateTime @default(now())

  @@id([projectId, assetId])
}

// ─────────────────────────────────────────────
// INTEGRATIONS (Webhooks / API Keys)
// ─────────────────────────────────────────────

model Integration {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  type           String       // "webhook" | "api_key" | "oauth_app"
  name           String
  config         Json         // Encrypted config blob
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([organizationId])
}

// ─────────────────────────────────────────────
// AUDIT LOG (Immutable — never update or delete)
// ─────────────────────────────────────────────

model AuditLog {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  actorId        String?      // userId of the person who performed the action
  actorEmail     String?      // Denormalized for log integrity if user is later deleted
  action         AuditAction
  entityType     String       // "project" | "member" | "milestone" | etc.
  entityId       String?
  before         Json?        // Snapshot of record before mutation
  after          Json?        // Snapshot of record after mutation
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime     @default(now())

  @@index([organizationId])
  @@index([actorId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

---

## Migration Commands

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create a new migration (development)
npx prisma migrate dev --name <descriptive_name>

# Apply migrations in production
npx prisma migrate deploy

# Reset and re-seed local database
npx prisma migrate reset --force
npx prisma db seed
```

---

## Schema Design Decisions

| Decision | Rationale |
|----------|-----------|
| `Json?` metadata columns on Project, Milestone, Asset, Member | Enables domain customization without schema migrations per customer |
| `organizationId` on every entity (not just top-level joins) | Enables fast, safe `WHERE organizationId = ?` at query layer without expensive joins |
| `AuditLog` with `before`/`after` JSON snapshots | Full compliance-grade audit trail; append-only (never delete rows) |
| Enums for status fields | Type safety at DB level; prevents invalid state strings |
| `OrganizationMember` role (not on User) | One user can belong to multiple orgs with different roles |
| `checklist Json?` on Deployment | Flexible punch-list without a dedicated table for v1 |

## Workflow revision — additive schema

The shipped schema keeps the weekly `TimesheetEntry` table for historical compatibility;
the monthly worklog workflow is additive. These current-schema extensions supersede the
earlier baseline snippets where they differ:

- `OrganizationMember`: bio, employment type, start date, timezone, working days, daily
  capacity, languages, preferred work mode, reporting-line self relation, and admin-only
  emergency contact fields.
- `MemberSkill`: normalized skill name, level, and years of experience. Legacy string-list
  skills are backfilled at a neutral level.
- `MemberCertification`: issuer, issue/expiry dates, and credential identifier.
- `ProjectMember`: tenant-scoped project assignment with `LEAD` or `MEMBER` role. Existing
  assignments, allocations, deployments, and weekly timesheets seed memberships.
- `Project.taskCounter`; `Task.taskNumber`, `sortOrder`, dates, parent/blocker references,
  reporter, and completion timestamp; `Milestone.startDate`.
- `Worklog`: per-day entries linked to member, project, optional task, category, and hours.
  `TimesheetPeriod` holds monthly submission/approval state. Existing weekly entries are
  copied to daily worklogs and monthly periods without deleting the source rows.
- Milestone progress is calculated from the proportion of linked tasks in the `COMPLETED`
  status. The legacy `Milestone.completionPct` column is retained for existing database
  compatibility and is not an application input or read source.
- `Notification`: tenant-scoped in-app reminders.
- `DeploymentMember`: multi-member assignments, backfilled from the legacy single `memberId`.
- `Deployment`: generic title/type/metadata fields.
- `Asset`: location, serial number, acquisition and service dates.
- `AssetCheckout`: same-tenant member, project, optional deployment, checkout, and return
  history. Assets with checkout history are retired rather than deleted.
- `TaskWorkflow`, `TaskWorkflowStatus`, and `TaskWorkflowTransition`: organization-scoped
  workflows assigned to projects, with ordered active statuses, stable reporting
  categories, required field keys, and allowed status transitions. Existing tasks are
  assigned to an organization default workflow by the migration.
- `Task.workflowStatusId`, `flaggedAt`, `flaggedByMemberId`, and `flagReason`: configurable
  workflow status and a separately tracked flag state. `Task.metadata` remains the
  persistence format for template-defined custom fields; users edit those fields through
  labeled controls, not a JSON editor.
- `TaskLabel` and `TaskLabelAssignment`: organization-scoped labels and tenant-safe task
  assignments.
- `AuditLog.outcome`, `severity`, `failureCategory`, `errorCode`, `summary`, and
  `correlationId`: distinguish successful activity from failure, warning-level user
  errors from application errors, and provide a safe human-readable audit summary.
- `Worklog.importKey`: optional organization-scoped external key used to update imported
  draft/reopened time entries without duplicating them.

---

## Field Mapping: Old → New

| Old (domain-specific) | New (generic) |
|-----------------------|---------------|
| `Engineer` model | `User` + `OrganizationMember` |
| `engineer.discipline` | `OrganizationMember.discipline` |
| `engineer.billingRateUsd` | `metadata` JSON field (financial data) |
| `Project.clientName` | `metadata` JSON field |
| `Project.feedstockType` | `metadata` JSON field |
| `Project.felStageGate` | `Project.status` (enum) |
| `Project.technologyLicensed` | `metadata` JSON field |
| `Milestone.isBillingGate` | `Milestone.requiresSignoff` |
| `Milestone.leadPeSignoff` | `Milestone.signoffByMemberId` |
| `InvoiceMilestone` | Moved to `metadata` JSON or separate billing module |
| `ISATag` | `Asset` model with `category = "ISA Tag"` and `metadata` JSON |
| `TravelDeployment` | `Deployment` model |
| `Allocation.deploymentMode` | `ResourceAllocation.mode` |

---

*Next: [`04_API_ROUTES.md`](./04_API_ROUTES.md)*
