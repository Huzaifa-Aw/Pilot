import { AuditAction, DeploymentStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { getDeploymentConflicts, tagConflictsByMember } from "@/lib/deployment-conflicts";

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured.", code: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "A valid cron bearer token is required.", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const deployments = await db.deployment.findMany({
    where: { status: DeploymentStatus.UPCOMING, startDate: { lte: today }, endDate: { gte: today } },
    include: { members: { select: { memberId: true } } },
  });
  let advanced = 0;
  for (const deployment of deployments) {
    const memberIds = deployment.members.length ? deployment.members.map(({ memberId }) => memberId) : [deployment.memberId];
    const result = await db.$transaction(async (tx) => {
      const conflicts = tagConflictsByMember(await Promise.all(memberIds.map(async (memberId) => ({
        memberId,
        conflicts: await getDeploymentConflicts({
          organizationId: deployment.organizationId,
          memberId,
          startDate: deployment.startDate,
          endDate: deployment.endDate,
          status: DeploymentStatus.ACTIVE,
          client: tx,
        }),
      }))));
      const updated = await tx.deployment.updateMany({
        where: { id: deployment.id, organizationId: deployment.organizationId, status: DeploymentStatus.UPCOMING },
        data: { status: DeploymentStatus.ACTIVE, conflictFlags: conflicts as Prisma.InputJsonValue },
      });
      if (updated.count !== 1) return false;
      await createAuditEvent({
        organizationId: deployment.organizationId,
        action: AuditAction.UPDATE,
        entityType: "deployment",
        entityId: deployment.id,
        before: { status: DeploymentStatus.UPCOMING, conflictFlags: deployment.conflictFlags },
        after: { status: DeploymentStatus.ACTIVE, conflictFlags: conflicts },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result) advanced += 1;
  }
  return NextResponse.json({ data: { advanced } });
}
