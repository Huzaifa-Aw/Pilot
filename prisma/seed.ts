import { AuditAction, Prisma, PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { createDefaultTaskWorkflow } from "../src/lib/task-workflows";

const seedInput = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
  ownerName: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().min(2).max(120),
  organizationSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

async function seed() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("The owner seed is only available in development.");
  }

  const input = seedInput.parse({
    email: process.env.SEED_OWNER_EMAIL,
    password: process.env.SEED_OWNER_PASSWORD,
    ownerName: process.env.SEED_OWNER_NAME,
    organizationName: process.env.SEED_ORGANIZATION_NAME,
    organizationSlug: process.env.SEED_ORGANIZATION_SLUG,
  });
  const db = new PrismaClient();
  const passwordHash = await hash(input.password, 12);

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.bootstrapState.findUnique({ where: { id: "global" } });
      if (existing) return;

      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug: input.organizationSlug },
      });
      await createDefaultTaskWorkflow(tx, organization.id);
      const user = await tx.user.create({
        data: { email: input.email, name: input.ownerName, passwordHash },
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
          joinedAt: new Date(),
        },
      });

      await tx.bootstrapState.create({
        data: { id: "global", organizationId: organization.id },
      });
      await tx.auditLog.createMany({
        data: [
          {
            organizationId: organization.id,
            actorId: user.id,
            actorEmail: user.email,
            action: AuditAction.CREATE,
            entityType: "organization",
            entityId: organization.id,
            after: { id: organization.id, name: organization.name, slug: organization.slug },
          },
          {
            organizationId: organization.id,
            actorId: user.id,
            actorEmail: user.email,
            action: AuditAction.CREATE,
            entityType: "organization_member",
            entityId: member.id,
            after: { id: member.id, role: member.role, userId: user.id },
          },
        ],
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } finally {
    await db.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error("Development seed failed.", error);
  process.exitCode = 1;
});
