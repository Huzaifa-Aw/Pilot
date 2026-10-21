import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { assetCheckoutSchema } from "@/lib/validations/asset";

type RouteContext = { params: Promise<{ assetId: string }> };

function isTransactionConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  const { assetId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = assetCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the checkout details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, organizationId: context.organizationId },
        select: { id: true, status: true },
      });
      if (!asset) return { kind: "not-found" as const };

      if (parsed.data.action === "checkout") {
        const [member, project, deployment, activeCheckout] = await Promise.all([
          tx.organizationMember.findFirst({
            where: { id: parsed.data.memberId, organizationId: context.organizationId, isActive: true },
            select: { id: true },
          }),
          parsed.data.projectId
            ? tx.project.findFirst({
                where: { id: parsed.data.projectId, organizationId: context.organizationId },
                select: { id: true },
              })
            : Promise.resolve(true),
          parsed.data.deploymentId
            ? tx.deployment.findFirst({
                where: { id: parsed.data.deploymentId, organizationId: context.organizationId, status: { in: ["UPCOMING", "ACTIVE"] } },
                  select: { id: true, projectId: true, members: { where: { organizationId: context.organizationId }, select: { memberId: true } } },
              })
            : Promise.resolve(null),
          tx.assetCheckout.findFirst({
            where: { assetId, organizationId: context.organizationId, returnedAt: null },
            select: { id: true },
          }),
        ]);
        if (!member || !project || (parsed.data.deploymentId && !deployment)) return { kind: "related-not-found" as const };
        if (deployment && !deployment.members.some(({ memberId }) => memberId === member.id)) return { kind: "deployment-member" as const };
        if (deployment && parsed.data.projectId && parsed.data.projectId !== deployment.projectId) return { kind: "deployment-project" as const };
        if (asset.status !== "ACTIVE") return { kind: "unavailable" as const };
        if (activeCheckout) return { kind: "checked-out" as const };

        const checkout = await tx.assetCheckout.create({
          data: {
            organizationId: context.organizationId,
            assetId,
            memberId: member.id,
            ...(deployment ? { projectId: deployment.projectId, deploymentId: deployment.id } : parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
            ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
          },
        });
        await createAuditEvent({
          organizationId: context.organizationId,
          actorId: context.userId,
          action: AuditAction.CREATE,
          entityType: "asset_checkout",
          entityId: checkout.id,
          after: {
            assetId,
            memberId: checkout.memberId,
            projectId: checkout.projectId,
            deploymentId: checkout.deploymentId,
            checkedOutAt: checkout.checkedOutAt.toISOString(),
            notes: checkout.notes,
          },
          userAgent: request.headers.get("user-agent"),
        }, tx);
        return { kind: "success" as const, data: checkout };
      }

      const [member, activeCheckout] = await Promise.all([
        tx.organizationMember.findFirst({
          where: { id: context.memberId, organizationId: context.organizationId, isActive: true },
          select: { id: true },
        }),
        tx.assetCheckout.findFirst({
          where: { assetId, organizationId: context.organizationId, returnedAt: null },
        }),
      ]);
      if (!member) return { kind: "related-not-found" as const };
      if (!activeCheckout) return { kind: "not-checked-out" as const };

      const returnedAt = new Date();
      const update = await tx.assetCheckout.updateMany({
        where: { id: activeCheckout.id, organizationId: context.organizationId, returnedAt: null },
        data: { returnedAt, returnedByMemberId: member.id },
      });
      if (update.count !== 1) return { kind: "not-checked-out" as const };
      await createAuditEvent({
        organizationId: context.organizationId,
        actorId: context.userId,
        action: AuditAction.UPDATE,
        entityType: "asset_checkout",
        entityId: activeCheckout.id,
        before: {
          assetId,
          memberId: activeCheckout.memberId,
          projectId: activeCheckout.projectId,
          deploymentId: activeCheckout.deploymentId,
          checkedOutAt: activeCheckout.checkedOutAt.toISOString(),
          returnedAt: null,
          notes: activeCheckout.notes,
        },
        after: {
          assetId,
          memberId: activeCheckout.memberId,
          projectId: activeCheckout.projectId,
          deploymentId: activeCheckout.deploymentId,
          checkedOutAt: activeCheckout.checkedOutAt.toISOString(),
          returnedAt: returnedAt.toISOString(),
          returnedByMemberId: member.id,
          notes: activeCheckout.notes,
        },
        userAgent: request.headers.get("user-agent"),
      }, tx);
      return { kind: "success" as const, data: { ...activeCheckout, returnedAt, returnedByMemberId: member.id } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found" || result.kind === "related-not-found") {
      return NextResponse.json({ error: "Asset, member, or project not found in this organization.", code: "NOT_FOUND" }, { status: 404 });
    }
    if (result.kind === "unavailable") {
      return NextResponse.json({ error: "Only active assets can be checked out.", code: "UNAVAILABLE" }, { status: 422 });
    }
    if (result.kind === "checked-out" || result.kind === "not-checked-out") {
      return NextResponse.json({ error: result.kind === "checked-out" ? "This asset already has an active checkout." : "This asset has no active checkout to return.", code: "CONFLICT" }, { status: 409 });
    }
    if (result.kind === "deployment-project") {
      return NextResponse.json({ error: "The selected deployment does not match the selected project.", code: "VALIDATION_ERROR" }, { status: 422 });
    }
    if (result.kind === "deployment-member") {
      return NextResponse.json({ error: "The selected person is not assigned to this deployment.", code: "VALIDATION_ERROR" }, { status: 422 });
    }
    return NextResponse.json({ data: result.data }, { status: parsed.data.action === "checkout" ? 201 : 200 });
  } catch (error) {
    if (isTransactionConflict(error)) {
      return NextResponse.json({ error: "The asset checkout changed. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
    }
    throw error;
  }
}
