import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const password = process.env.E2E_TEST_PASSWORD ?? "E2E-Only-Password-2026";
const users = [
  { email: "e2e-owner@example.test", name: "E2E Owner", role: "OWNER" as const },
  { email: "e2e-admin@example.test", name: "E2E Admin", role: "ADMIN" as const },
  { email: "e2e-manager@example.test", name: "E2E Manager", role: "MANAGER" as const },
  { email: "e2e-engineer@example.test", name: "E2E Engineer", role: "ENGINEER" as const },
  { email: "e2e-viewer@example.test", name: "E2E Viewer", role: "VIEWER" as const },
];

export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("Playwright fixture setup is restricted to a local database.");
  }
  const db = new PrismaClient();
  const passwordHash = await hash(password, 12);
  try {
    const organization = await db.organization.upsert({
      where: { slug: "playwright-access-workspace" },
      create: { slug: "playwright-access-workspace", name: "Playwright Access Workspace" },
      update: { isActive: true },
      select: { id: true },
    });
    await db.$transaction(async (tx) => {
      await tx.worklog.deleteMany({ where: { organizationId: organization.id } });
      await tx.timesheetPeriod.deleteMany({ where: { organizationId: organization.id } });
      await tx.notification.deleteMany({ where: { organizationId: organization.id } });
      await tx.timesheetEntry.deleteMany({ where: { organizationId: organization.id } });
      await tx.assetCheckout.deleteMany({ where: { organizationId: organization.id } });
      await tx.projectAsset.deleteMany({ where: { organizationId: organization.id } });
      await tx.asset.deleteMany({ where: { organizationId: organization.id } });
      await tx.deployment.deleteMany({ where: { organizationId: organization.id } });
      await tx.resourceAllocation.deleteMany({ where: { organizationId: organization.id } });
      await tx.allocationWeekLock.deleteMany({ where: { organizationId: organization.id } });
      await tx.task.updateMany({ where: { organizationId: organization.id }, data: { parentTaskId: null, blockedByTaskId: null } });
      await tx.taskAssignment.deleteMany({ where: { organizationId: organization.id } });
      await tx.task.deleteMany({ where: { organizationId: organization.id } });
      await tx.milestone.deleteMany({ where: { organizationId: organization.id } });
      await tx.projectMember.deleteMany({ where: { organizationId: organization.id } });
      await tx.project.updateMany({ where: { organizationId: organization.id }, data: { taskCounter: 0 } });
    });
    const members = [];
    for (const userInput of users) {
      const user = await db.user.upsert({
        where: { email: userInput.email },
        create: { email: userInput.email, name: userInput.name, passwordHash },
        update: { name: userInput.name, passwordHash },
        select: { id: true },
      });
      const member = await db.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        create: { organizationId: organization.id, userId: user.id, role: userInput.role, joinedAt: new Date() },
        update: { role: userInput.role, isActive: true },
        select: { id: true, role: true },
      });
      members.push(member);
    }
    const manager = members.find(({ role }) => role === "MANAGER");
    const engineer = members.find(({ role }) => role === "ENGINEER");
    if (!manager || !engineer) throw new Error("E2E manager and engineer fixtures were not created.");
    await db.organizationMember.update({
      where: { id_organizationId: { id: engineer.id, organizationId: organization.id } },
      data: { reportsToMemberId: manager.id },
    });
    const project = await db.project.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: "E2E-SHARED" } },
      create: { organizationId: organization.id, code: "E2E-SHARED", title: "Shared access test project" },
      update: { status: "ACTIVE" },
      select: { id: true, taskCounter: true },
    });
    const secondProject = await db.project.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: "E2E-SECOND" } },
      create: { organizationId: organization.id, code: "E2E-SECOND", title: "Second shared test project" },
      update: { status: "ACTIVE" },
      select: { id: true },
    });
    for (const [index, member] of members.entries()) {
      for (const projectId of [project.id, secondProject.id]) {
        await db.projectMember.upsert({
          where: { projectId_memberId: { projectId, memberId: member.id } },
          create: {
            organizationId: organization.id,
            projectId,
            memberId: member.id,
            role: index === 0 || index === 1 || index === 2 ? "LEAD" : "MEMBER",
          },
          update: { role: index === 0 || index === 1 || index === 2 ? "LEAD" : "MEMBER" },
        });
      }
    }
    let task = await db.task.findFirst({
      where: { organizationId: organization.id, projectId: project.id, title: "Shared board verification task" },
      select: { id: true, taskNumber: true },
    });
    if (!task) {
      const updatedProject = await db.project.update({
        where: { id_organizationId: { id: project.id, organizationId: organization.id } },
        data: { taskCounter: { increment: 1 } },
        select: { taskCounter: true },
      });
      task = await db.task.create({
        data: {
          organizationId: organization.id,
          projectId: project.id,
          taskNumber: updatedProject.taskCounter,
          sortOrder: updatedProject.taskCounter,
          title: "Shared board verification task",
          status: "BACKLOG",
        },
        select: { id: true, taskNumber: true },
      });
    } else {
      await db.task.update({
        where: { id_organizationId: { id: task.id, organizationId: organization.id } },
        data: { status: "BACKLOG", completedAt: null },
      });
    }
    await db.taskAssignment.upsert({
      where: { taskId_memberId: { taskId: task.id, memberId: engineer.id } },
      create: { organizationId: organization.id, taskId: task.id, memberId: engineer.id },
      update: {},
    });
  } finally {
    await db.$disconnect();
  }
}
