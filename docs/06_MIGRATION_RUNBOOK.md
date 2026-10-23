# 06 — Migration Runbook

> Step-by-step guide for migrating all existing records from the domain-specific
> schema into the new generic, multi-tenant schema. Execute in order.
> Estimated total time: 3–6 hours for a single-engineer team on a local/staging environment.

## Current application migrations — Local PostgreSQL and Supabase

Apply every checked-in Prisma migration independently to both the local PostgreSQL
database and the Supabase database. A successful migration against one target does not
update the other.

1. Configure `DATABASE_URL` and `DIRECT_URL` for the local PostgreSQL target, then run
   `npm run db:migrate` for development or `npm run db:deploy` to apply existing
   migrations.
2. Configure those same variables for the intended Supabase target, then run
   `npm run db:deploy`.
3. Run `npx prisma migrate status` against each target separately and verify both report
   the same migration history.
4. Back up production data before applying migrations. Never print or commit connection
   strings while switching targets.

The application schema is defined in [`../prisma/schema.prisma`](../prisma/schema.prisma);
the SQL files in `../prisma/migrations/` are the source of changes to apply.

---

## Pre-Migration Checklist

- [ ] Full database backup completed and verified restoreable
- [ ] New schema (`03_PRISMA_SCHEMA.md`) applied to a **separate** staging database
- [ ] Old and new database connection strings available in environment
- [ ] Migration script dependencies installed: `tsx`, `@prisma/client` for both schemas
- [ ] All team members notified of maintenance window (if production migration)
- [ ] Rollback plan documented (see Section 7)

---

## Phase 0 — Environment Setup

```bash
# 1. Install dependencies if not already present
npm install tsx

# 2. Create a .env.migration file with both DB connections
cat > .env.migration << 'EOF'
OLD_DATABASE_URL="postgresql://user:pass@host:5432/old_db"
NEW_DATABASE_URL="postgresql://user:pass@host:5432/new_db"
EOF

# 3. Apply the new schema to the target DB
DATABASE_URL=$NEW_DATABASE_URL npx prisma migrate deploy

# 4. Verify new schema is clean
DATABASE_URL=$NEW_DATABASE_URL npx prisma studio
```

---

## Phase 1 — Bootstrap the Seed Organization

Since the old app was single-tenant, all existing data belongs to one implicit org.
Create that org first in the new database.

```typescript
// prisma/migration-scripts/01_seed_org.ts

import { PrismaClient } from "@prisma/client";

const newDb = new PrismaClient({
  datasourceUrl: process.env.NEW_DATABASE_URL,
});

async function main() {
  const org = await newDb.organization.create({
    data: {
      name: process.env.ORG_NAME ?? "My Engineering Organization",
      slug: process.env.ORG_SLUG ?? "my-org",
      industry: process.env.ORG_INDUSTRY ?? "Engineering",
      timezone: "UTC",
    },
  });

  console.log("✅ Organization created:", org.id);
  console.log("   → Save this ID: set ORG_ID=" + org.id + " in .env.migration");
}

main().catch(console.error).finally(() => newDb.$disconnect());
```

```bash
ORG_NAME="Acme Engineering" ORG_SLUG="acme-eng" npx tsx prisma/migration-scripts/01_seed_org.ts
```

---

## Phase 2 — Migrate Users (Engineers → Users + OrganizationMembers)

The old `Engineer` model combines identity (name, email) with org-specific profile data.
Split this into `User` (identity) and `OrganizationMember` (org-scoped profile).

```typescript
// prisma/migration-scripts/02_migrate_members.ts

import { PrismaClient as OldClient } from "../generated/old-client";
import { PrismaClient as NewClient } from "@prisma/client";

const oldDb = new OldClient({ datasourceUrl: process.env.OLD_DATABASE_URL });
const newDb = new NewClient({ datasourceUrl: process.env.NEW_DATABASE_URL });
const ORG_ID = process.env.ORG_ID!;

// Map old engineer IDs → new member IDs for use in subsequent scripts
const memberIdMap = new Map<string, string>();

async function main() {
  const engineers = await oldDb.engineer.findMany();
  console.log(`Migrating ${engineers.length} engineers...`);

  for (const eng of engineers) {
    // Create User record
    const user = await newDb.user.upsert({
      where: { email: eng.email },
      create: {
        email: eng.email,
        name: eng.fullName,
        avatarUrl: eng.avatar ?? null,
      },
      update: {},
    });

    // Parse old JSON string fields
    const skills = safeJsonParse(eng.subSkills, []);
    const languages = safeJsonParse(eng.languages, []);

    // Create OrganizationMember record
    const member = await newDb.organizationMember.create({
      data: {
        organizationId: ORG_ID,
        userId: user.id,
        role: "ENGINEER",          // All migrated as ENGINEER; promote manually post-migration
        title: eng.title,
        discipline: eng.discipline,
        location: eng.location,
        phone: eng.phone ?? null,
        capacityHrsPerWeek: eng.baseCapacityHrs,
        skills: skills,
        joinedAt: eng.createdAt,
        isActive: true,
        // Move billing/financial data into metadata (domain-specific, not in core schema)
        metadata: {
          billingRateUsd:        eng.billingRateUsd,
          loadedCostUsd:         eng.loadedCostUsd,
          seniorityLevel:        eng.seniorityLevel,
          peLicenses:            safeJsonParse(eng.peLicenses, []),
          languages:             languages,
          passportExpiry:        eng.passportExpiry ?? null,
          visaStatus:            safeJsonParse(eng.visaStatus, null),
          bio:                   eng.bio ?? null,
          education:             eng.education ?? null,
          yearsOfExperience:     eng.yearsOfExperience ?? null,
          specializationHighlight: eng.specializationHighlight ?? null,
        },
      },
    });

    memberIdMap.set(eng.id, member.id);
    console.log(`  ✓ ${eng.fullName} → member:${member.id}`);
  }

  // Persist ID map for subsequent scripts
  await fs.writeFile("./.migration-cache/member-id-map.json",
    JSON.stringify(Object.fromEntries(memberIdMap), null, 2));

  console.log(`\n✅ Migrated ${engineers.length} engineers.`);
}

function safeJsonParse(value: string | null, fallback: unknown) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

main().catch(console.error).finally(() =>
  Promise.all([oldDb.$disconnect(), newDb.$disconnect()])
);
```

---

## Phase 3 — Migrate Projects

```typescript
// prisma/migration-scripts/03_migrate_projects.ts

// Maps old Project.id → new Project.id
const projectIdMap = new Map<string, string>();

async function main() {
  const projects = await oldDb.project.findMany();

  for (const proj of projects) {
    const newProject = await newDb.project.create({
      data: {
        organizationId: ORG_ID,
        code:  proj.projectCode,
        title: proj.projectName,
        status: mapProjectStatus(proj.felStageGate),
        startDate: proj.startDate ? new Date(proj.startDate) : null,
        endDate:   proj.endDate   ? new Date(proj.endDate)   : null,
        budgetHours:  proj.budgetedLaborHours,
        actualHours:  proj.actualLaborHoursBurned,
        // Move domain-specific fields to metadata
        metadata: {
          clientName:         proj.clientName,
          country:            proj.country,
          location:           proj.location,
          feedstockType:      proj.feedstockType ?? null,
          plantCapacity:      proj.plantCapacity ?? null,
          totalContractValue: proj.totalContractValue,
          targetMarginPct:    proj.targetMarginPct,
          contractScope:      proj.contractScope ?? null,
          technologyLicensed: proj.technologyLicensed ?? null,
          guaranteeMetric:    proj.guaranteeMetric ?? null,
          clientContact:      proj.clientContact ?? null,
          clientContactRole:  proj.clientContactRole ?? null,
        },
      },
    });

    projectIdMap.set(proj.id, newProject.id);
    console.log(`  ✓ ${proj.projectCode} — ${proj.projectName}`);
  }

  await fs.writeFile("./.migration-cache/project-id-map.json",
    JSON.stringify(Object.fromEntries(projectIdMap), null, 2));
}

function mapProjectStatus(felStage: string): ProjectStatus {
  const map: Record<string, ProjectStatus> = {
    "FEL-1": "PLANNING",
    "FEL-2": "PLANNING",
    "FEL-3": "ACTIVE",
    "FEED":  "ACTIVE",
    "EPC":   "ACTIVE",
    "Completed": "COMPLETED",
    "Archived":  "ARCHIVED",
  };
  return map[felStage] ?? "PLANNING";
}
```

---

## Phase 4 — Migrate Milestones

```typescript
// prisma/migration-scripts/04_migrate_milestones.ts

// Maps old Milestone.id → new Milestone.id
const milestoneIdMap = new Map<string, string>();

async function main() {
  const milestones = await oldDb.milestone.findMany();

  for (const ms of milestones) {
    const newProjectId = projectIdMap.get(ms.projectId);
    if (!newProjectId) { console.warn(`  ⚠ Missing project for milestone ${ms.id}`); continue; }

    const newMs = await newDb.milestone.create({
      data: {
        organizationId: ORG_ID,
        projectId:      newProjectId,
        sequenceNumber: ms.milestoneNumber,
        title:          ms.milestoneName,
        status:         mapMilestoneStatus(ms.status),
        targetDate:     ms.targetCompletionDate ? new Date(ms.targetCompletionDate) : null,
        completionPct:  ms.completionPct,
        requiresSignoff: ms.isBillingGate,
        metadata: {
          felStage:         ms.felStage,
          deliverableType:  ms.deliverableType,
          milestoneValueUsd: ms.milestoneValueUsd,
          signoffBy:        ms.signoffBy ?? null,
          signoffDate:      ms.signoffDate ?? null,
        },
      },
    });

    milestoneIdMap.set(ms.id, newMs.id);
  }

  await fs.writeFile("./.migration-cache/milestone-id-map.json",
    JSON.stringify(Object.fromEntries(milestoneIdMap), null, 2));

  console.log(`✅ Migrated ${milestones.length} milestones.`);
}

function mapMilestoneStatus(old: string): MilestoneStatus {
  const map: Record<string, MilestoneStatus> = {
    "Planned":          "PLANNED",
    "In Progress":      "IN_PROGRESS",
    "Ready to Invoice": "UNDER_REVIEW",
    "Invoiced":         "COMPLETED",
    "Paid":             "COMPLETED",
  };
  return map[old] ?? "PLANNED";
}
```

---

## Phase 5 — Migrate Allocations, Timesheets, Deployments

Follow the same pattern: load old records, look up new IDs from the cached maps,
create new records with `organizationId` injected on every row.

```bash
npx tsx prisma/migration-scripts/05_migrate_allocations.ts
npx tsx prisma/migration-scripts/06_migrate_timesheets.ts
npx tsx prisma/migration-scripts/07_migrate_deployments.ts
```

---

## Phase 6 — Migrate ISA Tags → Assets

```typescript
// prisma/migration-scripts/08_migrate_assets.ts
// ISA Tags become Assets with category="ISA Tag" and domain data in metadata

const tags = await oldDb.iSATag.findMany();

for (const tag of tags) {
  await newDb.asset.create({
    data: {
      organizationId: ORG_ID,
      assetCode: tag.tagNumber,
      title:     tag.description,
      category:  "ISA Tag",
      status:    tag.status,
      metadata: {
        system:         tag.system,
        pAndIdNumber:   tag.pAndIdNumber ?? null,
        designTemp:     tag.designTemp,
        designPressure: tag.designPressure,
        flowRate:       tag.flowRate ?? null,
        metallurgy:     tag.metallurgy ?? null,
        lastModified:   tag.lastModified ?? null,
      },
    },
  });
}
```

---

## Phase 7 — Verification Queries

Run these checks to confirm migration completeness:

```typescript
// prisma/migration-scripts/09_verify.ts

const checks = [
  {
    name: "Members migrated",
    old: await oldDb.engineer.count(),
    new: await newDb.organizationMember.count({ where: { organizationId: ORG_ID } }),
  },
  {
    name: "Projects migrated",
    old: await oldDb.project.count(),
    new: await newDb.project.count({ where: { organizationId: ORG_ID } }),
  },
  {
    name: "Milestones migrated",
    old: await oldDb.milestone.count(),
    new: await newDb.milestone.count({ where: { organizationId: ORG_ID } }),
  },
  {
    name: "Allocations migrated",
    old: await oldDb.allocation.count(),
    new: await newDb.resourceAllocation.count({ where: { organizationId: ORG_ID } }),
  },
  {
    name: "Timesheets migrated",
    old: await oldDb.timesheetEntry.count(),
    new: await newDb.timesheetEntry.count({ where: { organizationId: ORG_ID } }),
  },
  {
    name: "Deployments migrated",
    old: await oldDb.travelDeployment.count(),
    new: await newDb.deployment.count({ where: { organizationId: ORG_ID } }),
  },
  {
    name: "Assets migrated (ISA Tags)",
    old: await oldDb.iSATag.count(),
    new: await newDb.asset.count({ where: { organizationId: ORG_ID, category: "ISA Tag" } }),
  },
];

for (const check of checks) {
  const passed = check.old === check.new;
  console.log(`${passed ? "✅" : "❌"} ${check.name}: ${check.old} old → ${check.new} new`);
}
```

---

## Phase 8 — Post-Migration Steps

1. **Promote admin users**: Update `OrganizationMember.role` for operations managers and owners.
   ```sql
   UPDATE "OrganizationMember" SET role = 'OWNER' WHERE "userId" = '<owner-user-id>';
   UPDATE "OrganizationMember" SET role = 'ADMIN' WHERE "userId" IN ('<admin-ids>');
   ```

2. **Create MetadataTemplates**: Use the admin UI at `/settings/metadata-templates` to define
   field templates for Projects and Assets matching the migrated `metadata` JSON keys.

3. **Set passwords**: Trigger password-reset emails for all migrated users (they have no
   `passwordHash` yet if migrated from a non-auth system).

4. **Swap DATABASE_URL**: Point the application to `NEW_DATABASE_URL`.

5. **Smoke test** critical paths: login, view projects, create a task, submit a timesheet.

---

## Rollback Plan

If migration fails or data is corrupted:

```bash
# 1. Stop the new application (point traffic back to old DB if applicable)
# 2. Drop the new database schema
DATABASE_URL=$NEW_DATABASE_URL npx prisma migrate reset --force
# 3. Restore old application pointing to OLD_DATABASE_URL
# 4. Investigate and re-run migration scripts from Phase 0
```

---

*Next: [`07_ENVIRONMENT_AND_DEPLOYMENT.md`](./07_ENVIRONMENT_AND_DEPLOYMENT.md)*
