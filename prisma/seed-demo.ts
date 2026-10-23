import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  AuditAction,
  DeploymentStatus,
  Prisma,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  TimesheetPeriodStatus,
} from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { createAuditEvent } from "../src/lib/audit";
import { createDefaultTaskWorkflow } from "../src/lib/task-workflows";
import { getDefaultMetadataFields } from "../src/lib/metadata";
import { getDeploymentConflicts, tagConflictsByMember } from "../src/lib/deployment-conflicts";

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

class DemoSeedDryRun extends Error {
  constructor(readonly summary: Record<string, unknown>) {
    super("Demo seed dry run completed; transaction rolled back.");
  }
}

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function mondayFor(date: Date) {
  const monday = utcDay(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function sampleMetadata(fields: Array<{ key: string; label: string; type: string; options?: string[] }>) {
  const values: Record<string, Prisma.InputJsonValue> = {};
  for (const field of fields) {
    switch (field.type) {
      case "text":
        values[field.key] = `Sample ${field.label.toLowerCase()}`;
        break;
      case "textarea":
        values[field.key] = `Demo note for ${field.label.toLowerCase()}.`;
        break;
      case "number":
        values[field.key] = 12;
        break;
      case "date":
        values[field.key] = new Date().toISOString().slice(0, 10);
        break;
      case "boolean":
        values[field.key] = true;
        break;
      case "select":
        if (field.options?.[0]) values[field.key] = field.options[0];
        break;
      case "multi-select":
        values[field.key] = field.options?.slice(0, 2) ?? [];
        break;
    }
  }
  return values as Prisma.InputJsonObject;
}

async function createDemoWorkflow(tx: Prisma.TransactionClient, organizationId: string) {
  const existing = await tx.taskWorkflow.findFirst({
    where: { organizationId, name: "Demo delivery workflow" },
    include: { statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (existing) return existing;

  const workflow = await tx.taskWorkflow.create({
    data: { organizationId, name: "Demo delivery workflow" },
  });
  const statuses = await Promise.all([
    { key: "READY", name: "Ready", category: TaskStatus.BACKLOG, isInitial: true, requiredFieldKeys: [] },
    { key: "ACTIVE", name: "In progress", category: TaskStatus.IN_PROGRESS, isInitial: false, requiredFieldKeys: [] },
    { key: "REVIEW", name: "In review", category: TaskStatus.UNDER_REVIEW, isInitial: false, requiredFieldKeys: ["description"] },
    { key: "DONE", name: "Done", category: TaskStatus.COMPLETED, isInitial: false, requiredFieldKeys: [] },
    { key: "CANCELLED", name: "Cancelled", category: TaskStatus.CANCELLED, isInitial: false, requiredFieldKeys: [] },
  ].map((status, sortOrder) => tx.taskWorkflowStatus.create({
    data: { ...status, sortOrder, organizationId, workflowId: workflow.id },
  })));
  await tx.taskWorkflowTransition.createMany({
    data: statuses.flatMap((fromStatus) => statuses
      .filter(({ id }) => id !== fromStatus.id)
      .map((toStatus) => ({
        organizationId,
        workflowId: workflow.id,
        fromStatusId: fromStatus.id,
        toStatusId: toStatus.id,
      }))),
  });
  return { ...workflow, statuses };
}

async function createProject(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    code: string;
    title: string;
    description: string;
    status: ProjectStatus;
    startDate: Date;
    endDate: Date;
    budgetHours: number;
    workflowId: string;
    metadata: Prisma.InputJsonObject;
    ownerUserId: string;
  },
) {
  const existing = await tx.project.findFirst({
    where: { organizationId: input.organizationId, code: input.code },
  });
  if (existing) return { project: existing, created: false };

  const project = await tx.project.create({
    data: {
      organizationId: input.organizationId,
      code: input.code,
      title: input.title,
      description: input.description,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      budgetHours: input.budgetHours,
      workflowId: input.workflowId,
      metadata: input.metadata,
      tags: ["Demo data", "Sample project"],
    },
  });
  await createAuditEvent({
    organizationId: input.organizationId,
    actorId: input.ownerUserId,
    action: AuditAction.CREATE,
    entityType: "project",
    entityId: project.id,
    after: { code: project.code, title: project.title, status: project.status },
    summary: "Created a sample project for product demonstration.",
  }, tx);
  return { project, created: true };
}

async function createMilestone(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    projectId: string;
    sequenceNumber: number;
    title: string;
    description: string;
    status: "PLANNED" | "IN_PROGRESS" | "UNDER_REVIEW" | "APPROVED" | "COMPLETED";
    startDate: Date;
    targetDate: Date;
    requiresSignoff?: boolean;
    signoffByMemberId?: string | null;
    metadata: Prisma.InputJsonObject;
    actorId: string;
  },
) {
  const existing = await tx.milestone.findFirst({
    where: { projectId: input.projectId, sequenceNumber: input.sequenceNumber },
  });
  if (existing) return existing;

  const milestone = await tx.milestone.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      sequenceNumber: input.sequenceNumber,
      title: input.title,
      description: input.description,
      status: input.status,
      startDate: input.startDate,
      targetDate: input.targetDate,
      requiresSignoff: input.requiresSignoff ?? false,
      signoffByMemberId: input.signoffByMemberId ?? null,
      ...(input.signoffByMemberId ? { signoffAt: new Date() } : {}),
      completionPct: 0,
      metadata: input.metadata,
    },
  });
  await createAuditEvent({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: AuditAction.CREATE,
    entityType: "milestone",
    entityId: milestone.id,
    after: { title: milestone.title, status: milestone.status, sequenceNumber: milestone.sequenceNumber },
    summary: "Created a sample milestone for product demonstration.",
  }, tx);
  return milestone;
}

async function createTask(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    projectId: string;
    workflowId: string;
    taskNumber: number;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    estimatedHrs: number;
    actualHrs: number;
    startDate: Date;
    dueDate: Date;
    milestoneId: string | null;
    assigneeIds: string[];
    reporterMemberId: string;
    labelIds: string[];
    requiredDiscipline?: string | null;
    flagged?: boolean;
    flagReason?: string | null;
    metadata: Prisma.InputJsonObject;
    actorId: string;
  },
) {
  const existing = await tx.task.findFirst({
    where: { projectId: input.projectId, taskNumber: input.taskNumber },
  });
  if (existing) return { task: existing, created: false };

  const workflowStatus = await tx.taskWorkflowStatus.findFirst({
    where: { organizationId: input.organizationId, workflowId: input.workflowId, category: input.status, isActive: true },
  });
  if (!workflowStatus) throw new Error(`Missing active workflow status for ${input.status}.`);
  const task = await tx.task.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      taskNumber: input.taskNumber,
      sortOrder: input.taskNumber,
      title: input.title,
      description: input.description,
      status: input.status,
      workflowStatusId: workflowStatus.id,
      priority: input.priority,
      estimatedHrs: input.estimatedHrs,
      actualHrs: input.actualHrs,
      startDate: input.startDate,
      dueDate: input.dueDate,
      milestoneId: input.milestoneId,
      requiredDiscipline: input.requiredDiscipline ?? null,
      reporterMemberId: input.reporterMemberId,
      flaggedAt: input.flagged ? new Date() : null,
      flaggedByMemberId: input.flagged ? input.assigneeIds[0] ?? null : null,
      flagReason: input.flagged ? input.flagReason ?? "Sample flag for demonstration." : null,
      completedAt: input.status === TaskStatus.COMPLETED ? new Date() : null,
      metadata: input.metadata,
    },
  });
  if (input.assigneeIds.length) {
    await tx.taskAssignment.createMany({
      data: input.assigneeIds.map((memberId) => ({ organizationId: input.organizationId, taskId: task.id, memberId })),
      skipDuplicates: true,
    });
  }
  if (input.labelIds.length) {
    await tx.taskLabelAssignment.createMany({
      data: input.labelIds.map((labelId) => ({ organizationId: input.organizationId, taskId: task.id, labelId })),
      skipDuplicates: true,
    });
  }
  await createAuditEvent({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: AuditAction.CREATE,
    entityType: "task",
    entityId: task.id,
    after: { title: task.title, status: task.status, priority: task.priority, taskNumber: task.taskNumber },
    summary: "Created a sample task for product demonstration.",
  }, tx);
  return { task, created: true };
}

async function seedDemo() {
  if (process.env.SEED_DEMO_CONFIRM_SUPABASE !== "YES") {
    throw new Error("Set SEED_DEMO_CONFIRM_SUPABASE=YES to confirm this additive Supabase demo-data seed.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error("DATABASE_URL and DIRECT_URL are required.");
  const allowedSupabaseHost = (hostname: string) => hostname.endsWith(".supabase.com") || hostname.endsWith(".supabase.co");
  if (!allowedSupabaseHost(new URL(databaseUrl).hostname) || !allowedSupabaseHost(new URL(directUrl).hostname)) {
    throw new Error("Demo seeding is restricted to Supabase DATABASE_URL and DIRECT_URL targets.");
  }

  try {
    const bootstrap = await db.bootstrapState.findUnique({
      where: { id: "global" },
      select: { organizationId: true },
    });
    if (!bootstrap) throw new Error("No bootstrapped organization exists; create the owner workspace first.");

    let summary: Record<string, unknown>;
    try {
      summary = await db.$transaction(async (tx) => {
      const organizationId = bootstrap.organizationId;
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { id: true, name: true },
      });
      const members = await tx.organizationMember.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, role: true, userId: true, capacityHrsPerWeek: true, user: { select: { email: true } } },
      });
      const owner = members.find(({ role }) => role === "OWNER");
      const admin = members.find(({ role }) => role === "ADMIN");
      const manager = members.find(({ role }) => role === "MANAGER");
      const engineer = members.find(({ role }) => role === "ENGINEER");
      const viewer = members.find(({ role }) => role === "VIEWER");
      if (!owner || !manager || !engineer) throw new Error("The workspace needs active Owner, Manager, and Engineer members for a representative demo.");

      const defaultWorkflow = await createDefaultTaskWorkflow(tx, organizationId);
      const customWorkflow = await createDemoWorkflow(tx, organizationId);
      const today = utcDay(new Date());
      const thisWeek = mondayFor(today);
      const endOfQuarter = addDays(today, 120);
      const startOfQuarter = addDays(today, -30);

      const templateDefinitions = [
        { entityType: "project", name: "Demo project fields", fields: [
          { key: "deliveryPhase", label: "Delivery phase", type: "select", options: ["Planning", "Design", "Delivery", "Closeout"], order: 0 },
          { key: "workstream", label: "Workstream", type: "text", order: 1 },
        ] },
        { entityType: "task", name: "Demo task fields", fields: [
          { key: "reviewType", label: "Review type", type: "select", options: ["Peer review", "Client review", "Quality review"], order: 0 },
          { key: "referenceNote", label: "Reference note", type: "text", order: 1 },
        ] },
        { entityType: "milestone", name: "Demo milestone fields", fields: [
          { key: "acceptanceEvidence", label: "Acceptance evidence", type: "textarea", order: 0 },
        ] },
        { entityType: "asset", name: "Demo asset fields", fields: [
          { key: "condition", label: "Condition", type: "select", options: ["Good", "Needs inspection", "Under service"], order: 0 },
          { key: "serviceIntervalMonths", label: "Service interval", type: "number", unit: "months", order: 1 },
        ] },
        { entityType: "deployment", name: "Demo deployment fields", fields: [
          { key: "readiness", label: "Readiness", type: "select", options: ["Preparing", "Ready", "Review required"], order: 0 },
        ] },
        { entityType: "member", name: "Demo member fields", fields: [
          { key: "onboardingStage", label: "Onboarding stage", type: "select", options: ["Orientation", "Active", "Specialist"], order: 0 },
        ] },
      ] as const;
      for (const template of templateDefinitions) {
        const existing = await tx.metadataTemplate.findFirst({
          where: { organizationId, entityType: template.entityType, isDefault: true },
          select: { id: true },
        });
        if (!existing) {
          await tx.metadataTemplate.create({
            data: {
              organizationId,
              entityType: template.entityType,
              name: template.name,
              fields: template.fields as Prisma.InputJsonValue,
              isDefault: true,
              defaultKey: `sample-data-${organizationId}-${template.entityType}`,
            },
          });
        }
      }

      const [projectFields, taskFields, milestoneFields, assetFields, deploymentFields] = await Promise.all([
        getDefaultMetadataFields(organizationId, "project", tx),
        getDefaultMetadataFields(organizationId, "task", tx),
        getDefaultMetadataFields(organizationId, "milestone", tx),
        getDefaultMetadataFields(organizationId, "asset", tx),
        getDefaultMetadataFields(organizationId, "deployment", tx),
      ]);
      const labelsData = [
        { name: "Planning", color: "blue" },
        { name: "Coordination", color: "amber" },
        { name: "Quality review", color: "green" },
        { name: "Documentation", color: "neutral" },
      ];
      const labels: Array<{ id: string; name: string; color: string }> = [];
      for (const item of labelsData) {
        const existing = await tx.taskLabel.findFirst({ where: { organizationId, name: item.name } });
        labels.push(existing ?? await tx.taskLabel.create({ data: { organizationId, ...item } }));
      }
      const labelId = (name: string) => labels.find(({ name: item }) => item === name)!.id;
      for (const [member, skills] of [
        [engineer, [{ name: "Capacity planning", level: 4, yearsExperience: 5 }, { name: "Quality review", level: 3, yearsExperience: 3 }]],
        [manager, [{ name: "Project coordination", level: 4, yearsExperience: 7 }, { name: "Delivery planning", level: 4, yearsExperience: 6 }]],
      ] as const) {
        for (const skill of skills) {
          const existing = await tx.memberSkill.findFirst({ where: { organizationId, memberId: member.id, name: skill.name } });
          if (!existing) await tx.memberSkill.create({ data: { organizationId, memberId: member.id, ...skill } });
        }
      }
      const certificate = await tx.memberCertification.findFirst({
        where: { organizationId, memberId: engineer.id, name: "Quality Management Fundamentals" },
      });
      if (!certificate) {
        await tx.memberCertification.create({
          data: {
            organizationId,
            memberId: engineer.id,
            name: "Quality Management Fundamentals",
            issuer: "Sample Training Provider",
            issuedOn: addDays(today, -365),
            expiresOn: addDays(today, 365),
            credentialId: "DEMO-QMF-1042",
          },
        });
      }

      const projectInputs = [
        {
          code: "DEMO-OPS",
          title: "Operations readiness improvement",
          description: "Coordinate readiness checks, operating procedures, and handover evidence across a multi-disciplinary delivery team.",
          status: ProjectStatus.ACTIVE,
          budgetHours: 420,
          workflowId: defaultWorkflow.id,
          metadata: sampleMetadata(projectFields),
        },
        {
          code: "DEMO-PLAN",
          title: "Resource planning rollout",
          description: "Introduce a consistent planning cadence, validate forecast demand, and prepare the team for a measured rollout.",
          status: ProjectStatus.ACTIVE,
          budgetHours: 260,
          workflowId: customWorkflow.id,
          metadata: sampleMetadata(projectFields),
        },
        {
          code: "DEMO-QUAL",
          title: "Quality systems alignment",
          description: "Align review standards, evidence capture, and quality checkpoints across current project delivery.",
          status: ProjectStatus.PLANNING,
          budgetHours: 180,
          workflowId: defaultWorkflow.id,
          metadata: sampleMetadata(projectFields),
        },
      ];
      const projects = [];
      let projectsCreated = 0;
      for (const input of projectInputs) {
        const result = await createProject(tx, {
          organizationId,
          ...input,
          startDate: startOfQuarter,
          endDate: endOfQuarter,
          ownerUserId: owner.userId,
        });
        projects.push(result.project);
        if (result.created) projectsCreated += 1;
        const scopedMembers = [owner, admin, manager, engineer, viewer].filter((member): member is NonNullable<typeof member> => Boolean(member));
        for (const member of scopedMembers) {
          const existingMembership = await tx.projectMember.findFirst({
            where: { projectId: result.project.id, memberId: member.id },
          });
          if (!existingMembership) {
            await tx.projectMember.create({
              data: {
                organizationId,
                projectId: result.project.id,
                memberId: member.id,
                role: member.role === "OWNER" || member.role === "MANAGER" ? "LEAD" : "MEMBER",
              },
            });
          }
        }
      }
      const [opsProject, planningProject, qualityProject] = projects;
      const createdCounts = { milestones: 0, tasks: 0, allocations: 0, worklogs: 0, assets: 0 };

      const milestoneSpecs = [
        { project: opsProject, seq: 1, title: "Readiness scope agreed", description: "Confirm the scope, owners, and measurable acceptance evidence.", status: "COMPLETED" as const, start: addDays(today, -28), target: addDays(today, -14), requiresSignoff: true, signer: owner.id },
        { project: opsProject, seq: 2, title: "Operational review complete", description: "Resolve open items and prepare the operating handover.", status: "IN_PROGRESS" as const, start: addDays(today, -7), target: addDays(today, 21), requiresSignoff: true, signer: null },
        { project: opsProject, seq: 3, title: "Handover accepted", description: "Confirm ownership and close out remaining delivery actions.", status: "PLANNED" as const, start: addDays(today, 14), target: addDays(today, 45), requiresSignoff: false, signer: null },
        { project: planningProject, seq: 1, title: "Demand baseline validated", description: "Review forecast inputs and agree the capacity baseline.", status: "IN_PROGRESS" as const, start: addDays(today, -10), target: addDays(today, 18), requiresSignoff: false, signer: null },
        { project: planningProject, seq: 2, title: "Planning pilot ready", description: "Publish guidance and prepare the pilot group.", status: "PLANNED" as const, start: addDays(today, 14), target: addDays(today, 42), requiresSignoff: true, signer: null },
        { project: qualityProject, seq: 1, title: "Review framework agreed", description: "Align review criteria and evidence expectations.", status: "UNDER_REVIEW" as const, start: addDays(today, -3), target: addDays(today, 25), requiresSignoff: true, signer: null },
      ];
      const milestones = new Map<string, { id: string; projectId: string }>();
      for (const spec of milestoneSpecs) {
        const existing = await tx.milestone.findFirst({ where: { projectId: spec.project.id, sequenceNumber: spec.seq } });
        const milestone = existing ?? await createMilestone(tx, {
          organizationId,
          projectId: spec.project.id,
          sequenceNumber: spec.seq,
          title: spec.title,
          description: spec.description,
          status: spec.status,
          startDate: spec.start,
          targetDate: spec.target,
          requiresSignoff: spec.requiresSignoff,
          signoffByMemberId: spec.signer,
          metadata: sampleMetadata(milestoneFields),
          actorId: owner.userId,
        });
        if (!existing) {
          createdCounts.milestones += 1;
        }
        milestones.set(`${spec.project.id}:${spec.seq}`, milestone);
      }

      const taskSpecs = [
        { project: opsProject, milestone: 1, number: 1, title: "Confirm operating assumptions", description: "Document assumptions, owners, and handover criteria for the first review.", status: TaskStatus.COMPLETED, priority: TaskPriority.MEDIUM, estimate: 12, actual: 11, assignees: [manager.id], labels: ["Planning", "Documentation"], requiredDiscipline: "Operations", start: addDays(today, -28), due: addDays(today, -14) },
        { project: opsProject, milestone: 2, number: 2, title: "Review readiness evidence", description: "Check evidence against the agreed acceptance criteria and record remaining gaps.", status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, estimate: 20, actual: 8, assignees: [engineer.id], labels: ["Coordination", "Quality review"], requiredDiscipline: "Operations", start: addDays(today, -7), due: addDays(today, 5), flagged: true },
        { project: opsProject, milestone: 3, number: 3, title: "Publish handover package", description: "Prepare the final handover package after readiness actions are closed.", status: TaskStatus.BACKLOG, priority: TaskPriority.MEDIUM, estimate: 16, actual: 0, assignees: [manager.id], labels: ["Documentation"], requiredDiscipline: null, start: addDays(today, 14), due: addDays(today, 35) },
        { project: planningProject, milestone: 1, number: 1, title: "Collect demand forecast", description: "Collect weekly demand assumptions from project leads for the pilot window.", status: TaskStatus.COMPLETED, priority: TaskPriority.MEDIUM, estimate: 10, actual: 9, assignees: [engineer.id], labels: ["Planning"], requiredDiscipline: "Planning", start: addDays(today, -10), due: addDays(today, -3) },
        { project: planningProject, milestone: 1, number: 2, title: "Validate weekly capacity assumptions", description: "Compare team availability with the forecast and document any constraints.", status: TaskStatus.UNDER_REVIEW, priority: TaskPriority.HIGH, estimate: 14, actual: 10, assignees: [manager.id, engineer.id], labels: ["Coordination", "Quality review"], requiredDiscipline: "Planning", start: addDays(today, -4), due: addDays(today, 7) },
        { project: planningProject, milestone: 2, number: 3, title: "Publish pilot planning guidance", description: "Prepare a concise guide for project leads and the pilot group.", status: TaskStatus.BACKLOG, priority: TaskPriority.LOW, estimate: 8, actual: 0, assignees: [manager.id], labels: ["Documentation"], requiredDiscipline: null, start: addDays(today, 14), due: addDays(today, 34) },
        { project: qualityProject, milestone: 1, number: 1, title: "Align review criteria", description: "Agree a reusable review checklist and capture approval evidence.", status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, estimate: 12, actual: 4, assignees: [manager.id], labels: ["Quality review"], requiredDiscipline: "Quality", start: addDays(today, -2), due: addDays(today, 12) },
        { project: qualityProject, milestone: 1, number: 2, title: "Prepare evidence register", description: "Map required evidence to the quality review checkpoints.", status: TaskStatus.BACKLOG, priority: TaskPriority.MEDIUM, estimate: 10, actual: 0, assignees: [engineer.id], labels: ["Documentation"], requiredDiscipline: "Quality", start: today, due: addDays(today, 19) },
      ];
      const taskIds = new Map<string, string>();
      for (const spec of taskSpecs) {
        const milestone = milestones.get(`${spec.project.id}:${spec.milestone}`);
        if (!milestone) throw new Error(`Missing demo milestone for ${spec.title}.`);
        const workflow = spec.project.id === planningProject.id ? customWorkflow : defaultWorkflow;
        const result = await createTask(tx, {
          organizationId,
          projectId: spec.project.id,
          workflowId: workflow.id,
          taskNumber: spec.number,
          title: spec.title,
          description: spec.description,
          status: spec.status,
          priority: spec.priority,
          estimatedHrs: spec.estimate,
          actualHrs: spec.actual,
          startDate: spec.start,
          dueDate: spec.due,
          milestoneId: milestone.id,
          assigneeIds: spec.assignees,
          reporterMemberId: manager.id,
          labelIds: spec.labels.map(labelId),
          requiredDiscipline: spec.requiredDiscipline,
          flagged: "flagged" in spec ? spec.flagged : false,
          flagReason: "flagged" in spec && spec.flagged ? "Evidence review is waiting on one supporting document." : null,
          metadata: sampleMetadata(taskFields),
          actorId: owner.userId,
        });
        if (result.created) createdCounts.tasks += 1;
        taskIds.set(`${spec.project.id}:${spec.number}`, result.task.id);
      }
      const blockedTaskId = taskIds.get(`${opsProject.id}:3`);
      const blockerTaskId = taskIds.get(`${opsProject.id}:2`);
      if (blockedTaskId && blockerTaskId) {
        await tx.task.updateMany({
          where: { id: blockedTaskId, organizationId, blockedByTaskId: null },
          data: { blockedByTaskId: blockerTaskId },
        });
      }

      for (const member of [owner, manager, engineer]) {
        for (const project of projects) {
          const allocationPct = member.id === engineer.id
            ? project.id === opsProject.id ? 40 : project.id === planningProject.id ? 30 : 15
            : member.id === manager.id && project.id === opsProject.id ? 25
              : member.id === owner.id && project.id === qualityProject.id ? 20
                : 0;
          if (!allocationPct) continue;
          for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
            const weekStartDate = addDays(thisWeek, weekIndex * 7);
            const existing = await tx.resourceAllocation.findFirst({
              where: { organizationId, memberId: member.id, projectId: project.id, weekStartDate },
            });
            if (existing) continue;
            const plannedHrs = member.capacityHrsPerWeek * allocationPct / 100;
            const allocation = await tx.resourceAllocation.create({
              data: {
                organizationId,
                memberId: member.id,
                projectId: project.id,
                milestoneId: milestones.get(`${project.id}:1`)?.id ?? null,
                weekStartDate,
                plannedHrs,
                allocationPct,
                mode: weekIndex % 2 ? "Hybrid" : "Remote",
                notes: "Sample planning allocation.",
              },
            });
            createdCounts.allocations += 1;
            await createAuditEvent({
              organizationId,
              actorId: owner.userId,
              action: AuditAction.CREATE,
              entityType: "resource_allocation",
              entityId: allocation.id,
              after: { projectId: project.id, memberId: member.id, weekStartDate: weekStartDate.toISOString().slice(0, 10), plannedHrs, allocationPct },
              summary: "Created a sample allocation for product demonstration.",
            }, tx);
          }
        }
      }

      const deploymentStart = addDays(today, 4);
      const deploymentEnd = addDays(deploymentStart, 5);
      let deployment = await tx.deployment.findFirst({
        where: { organizationId, title: "Operations readiness field review", projectId: opsProject.id },
        include: { members: { select: { memberId: true } } },
      });
      if (!deployment) {
        const membersForDeployment = [engineer.id, manager.id];
        const conflicts = tagConflictsByMember(await Promise.all(membersForDeployment.map(async (memberId) => ({
          memberId,
          conflicts: await getDeploymentConflicts({
            organizationId,
            memberId,
            startDate: deploymentStart,
            endDate: deploymentEnd,
            status: DeploymentStatus.UPCOMING,
            client: tx,
          }),
        }))));
        deployment = await tx.deployment.create({
          data: {
            organizationId,
            memberId: engineer.id,
            projectId: opsProject.id,
            title: "Operations readiness field review",
            deploymentType: "Field review",
            location: "Regional operations site",
            country: "Sample region",
            startDate: deploymentStart,
            endDate: deploymentEnd,
            status: DeploymentStatus.UPCOMING,
            notes: "Sample multi-member deployment to demonstrate scheduling and allocation conflicts.",
            conflictFlags: conflicts as Prisma.InputJsonArray,
            checklist: [
              { id: randomUUID(), label: "Confirm site access", complete: true },
              { id: randomUUID(), label: "Review readiness evidence", complete: false },
              { id: randomUUID(), label: "Complete handover notes", complete: false },
            ],
            metadata: sampleMetadata(deploymentFields),
            members: { create: membersForDeployment.map((memberId) => ({ memberId })) },
          },
          include: { members: { select: { memberId: true } } },
        });
        await createAuditEvent({
          organizationId,
          actorId: owner.userId,
          action: AuditAction.CREATE,
          entityType: "deployment",
          entityId: deployment.id,
          after: { title: deployment.title, projectId: deployment.projectId, status: deployment.status },
          summary: "Created a sample deployment for product demonstration.",
        }, tx);
      }

      const assetsData = [
        { assetCode: "DEMO-SURVEY-01", title: "Survey instrument", category: "Measurement equipment", status: "ACTIVE", location: "Equipment store", serialNumber: "DEMO-SN-1042", nextServiceDate: addDays(today, 60), metadata: sampleMetadata(assetFields) },
        { assetCode: "DEMO-CAL-02", title: "Calibration kit", category: "Quality equipment", status: "MAINTENANCE", location: "Service area", serialNumber: "DEMO-SN-2088", nextServiceDate: addDays(today, 7), metadata: sampleMetadata(assetFields) },
        { assetCode: "DEMO-DOC-03", title: "Inspection document set", category: "Reference material", status: "ACTIVE", location: "Digital register", serialNumber: null, nextServiceDate: null, metadata: sampleMetadata(assetFields) },
      ];
      const assets = [];
      for (const input of assetsData) {
        let asset = await tx.asset.findFirst({ where: { organizationId, assetCode: input.assetCode } });
        if (!asset) {
          asset = await tx.asset.create({ data: { organizationId, ...input } });
          createdCounts.assets += 1;
          await createAuditEvent({
            organizationId,
            actorId: owner.userId,
            action: AuditAction.CREATE,
            entityType: "asset",
            entityId: asset.id,
            after: { assetCode: asset.assetCode, title: asset.title, status: asset.status },
            summary: "Created a sample asset for product demonstration.",
          }, tx);
        }
        assets.push(asset);
        await tx.projectAsset.upsert({
          where: { projectId_assetId: { projectId: opsProject.id, assetId: asset.id } },
          create: { organizationId, projectId: opsProject.id, assetId: asset.id },
          update: {},
        });
      }
      const activeCheckout = await tx.assetCheckout.findFirst({
        where: { organizationId, assetId: assets[0].id, returnedAt: null },
      });
      if (!activeCheckout) {
        await tx.assetCheckout.create({
          data: {
            organizationId,
            assetId: assets[0].id,
            memberId: engineer.id,
            projectId: opsProject.id,
            deploymentId: deployment.id,
            notes: "Sample checkout for the readiness field review.",
          },
        });
      }

      const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const openPeriod = await tx.timesheetPeriod.findFirst({
        where: { organizationId, memberId: owner.id, monthStart: currentMonth },
      });
      if (!openPeriod) {
        await tx.timesheetPeriod.create({
          data: { organizationId, memberId: owner.id, monthStart: currentMonth, status: TimesheetPeriodStatus.OPEN },
        });
      }
      const submittedPeriod = await tx.timesheetPeriod.findFirst({
        where: { organizationId, memberId: engineer.id, monthStart: currentMonth },
      });
      if (!submittedPeriod) {
        await tx.timesheetPeriod.create({
          data: {
            organizationId,
            memberId: engineer.id,
            monthStart: currentMonth,
            status: TimesheetPeriodStatus.SUBMITTED,
            submittedAt: new Date(),
            reviewNotes: "Sample submitted period for the approval queue.",
          },
        });
      }
      const worklogDates: Date[] = [];
      for (let offset = 1; offset <= today.getUTCDate() && worklogDates.length < 3; offset += 1) {
        const date = addDays(today, -offset);
        if (date.getUTCMonth() === today.getUTCMonth() && ![0, 6].includes(date.getUTCDay())) worklogDates.push(date);
      }
      for (const [index, date] of worklogDates.entries()) {
        for (const member of [owner, engineer]) {
          const isEngineer = member.id === engineer.id;
          const importKey = `demo-feature-tour-${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${member.id}-${index}`;
          const existing = await tx.worklog.findFirst({ where: { organizationId, importKey } });
          if (existing) continue;
          const worklog = await tx.worklog.create({
            data: {
              organizationId,
              memberId: member.id,
              projectId: isEngineer ? opsProject.id : planningProject.id,
              taskId: isEngineer ? taskIds.get(`${opsProject.id}:2`) : taskIds.get(`${planningProject.id}:2`),
              date,
              hours: index === 0 ? 3.5 : 4,
              description: isEngineer
                ? "Reviewed readiness evidence and recorded follow-up actions."
                : "Coordinated the capacity review and updated planning assumptions.",
              category: null,
              importKey,
            },
          });
          createdCounts.worklogs += 1;
          await createAuditEvent({
            organizationId,
            actorId: owner.userId,
            action: AuditAction.CREATE,
            entityType: "worklog",
            entityId: worklog.id,
            after: { memberId: worklog.memberId, projectId: worklog.projectId, date: date.toISOString().slice(0, 10), hours: worklog.hours },
            summary: "Created a sample worklog for product demonstration.",
          }, tx);
        }
      }

      const existingNotification = await tx.notification.findFirst({
        where: { organizationId, memberId: owner.id, type: "DEMO_TOUR", dedupeKey: "sample-data-tour" },
      });
      if (!existingNotification) {
        await tx.notification.create({
          data: {
            organizationId,
            memberId: owner.id,
            type: "DEMO_TOUR",
            dedupeKey: "sample-data-tour",
            payload: { message: "Sample workspace data is ready. Explore projects, tasks, milestones, people, time, deployments, and assets." },
          },
        });
      }

      const result = {
        organizationName: organization.name,
        projects: projectsCreated,
        milestones: createdCounts.milestones,
        tasks: createdCounts.tasks,
        allocations: createdCounts.allocations,
        worklogs: createdCounts.worklogs,
        assets: createdCounts.assets,
      };
      if (process.env.SEED_DEMO_DRY_RUN === "YES") throw new DemoSeedDryRun(result);
      return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 120_000 });
    } catch (error) {
      if (!(error instanceof DemoSeedDryRun)) throw error;
      console.log("Dry run succeeded; transaction rolled back.");
      console.log(JSON.stringify(error.summary));
      return;
    }

    console.log("Supabase demo seed complete.");
    console.log(JSON.stringify(summary));
  } finally {
    await db.$disconnect();
  }
}

seedDemo().catch((error: unknown) => {
  console.error("Supabase demo seed failed.", error);
  process.exitCode = 1;
});
