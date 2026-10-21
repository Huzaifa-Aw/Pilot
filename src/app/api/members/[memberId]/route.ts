import { AuditAction, MemberRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditEvent } from "@/lib/audit";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { prepareMetadataValues } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import { roleAtLeast } from "@/lib/rbac";
import { memberUpdateSchema } from "@/lib/validations/member";

type RouteContext = { params: Promise<{ memberId: string }> };

function memberSnapshot(member: {
  id: string;
  userId: string;
  role: MemberRole;
  title: string | null;
  discipline: string | null;
  department: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  employmentType: string | null;
  startDate: Date | null;
  timezone: string;
  workingDays: number[];
  dailyCapacityHrs: number;
  languages: string[];
  preferredWorkMode: string | null;
  reportsToMemberId: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  capacityHrsPerWeek: number;
  skills: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  isActive: boolean;
}) {
  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    title: member.title,
    discipline: member.discipline,
    department: member.department,
    phone: member.phone,
    location: member.location,
    bio: member.bio,
    employmentType: member.employmentType,
    startDate: member.startDate?.toISOString().slice(0, 10) ?? null,
    timezone: member.timezone,
    workingDays: member.workingDays,
    dailyCapacityHrs: member.dailyCapacityHrs,
    languages: member.languages,
    preferredWorkMode: member.preferredWorkMode,
    reportsToMemberId: member.reportsToMemberId,
    emergencyContactName: member.emergencyContactName,
    emergencyContactPhone: member.emergencyContactPhone,
    capacityHrsPerWeek: member.capacityHrsPerWeek,
    skills: member.skills,
    metadata: member.metadata,
    isActive: member.isActive,
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ENGINEER");
  if (response) return response;
  const { memberId } = await params;

  const member = await db.organizationMember.findFirst({
    where: { id: memberId, organizationId: context.organizationId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      reportsTo: { select: { id: true, user: { select: { name: true, email: true } } } },
      skillsProfile: { orderBy: { name: "asc" } },
      certifications: { orderBy: [{ expiresOn: "asc" }, { name: "asc" }] },
      allocations: {
        where: { organizationId: context.organizationId },
        orderBy: { weekStartDate: "desc" },
        take: 20,
        include: { project: { select: { id: true, code: true, title: true } } },
      },
      _count: { select: { timesheetEntries: true, taskAssignments: true, deployments: true } },
    },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({
    data: roleAtLeast(context.role, "ADMIN")
      ? member
      : { ...member, emergencyContactName: null, emergencyContactPhone: null },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("VIEWER");
  if (response) return response;
  const { memberId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    throw error;
  }
  const parsed = memberUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the member details.", code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const changesRole = parsed.data.role !== undefined;
  const changesActive = parsed.data.isActive !== undefined;
  const hasProfileChanges = Object.keys(parsed.data).some((key) => !["role", "isActive"].includes(key));
  if (changesRole && !(await can(context, "role.manage"))) {
    return NextResponse.json({ error: "An administrator or owner is required to change roles.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (changesActive && !(await can(context, "role.manage"))) {
    return NextResponse.json({ error: "An administrator or owner is required to change membership status.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (hasProfileChanges && !(await can(context, "profile.update", { memberId })) &&
      !(await can(context, "profile.manage", { memberId }))) {
    return NextResponse.json({ error: "Update your own profile or ask a manager to make this change.", code: "FORBIDDEN" }, { status: 403 });
  }
  if ((parsed.data.emergencyContactName !== undefined || parsed.data.emergencyContactPhone !== undefined) &&
      !(await can(context, "role.manage"))) {
    return NextResponse.json({ error: "Emergency contact details are restricted to administrators.", code: "FORBIDDEN" }, { status: 403 });
  }

  const updated = await db.$transaction(async (tx) => {
    const before = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };
    if (parsed.data.reportsToMemberId !== undefined) {
      if (parsed.data.reportsToMemberId === memberId) return { kind: "reporting-cycle" as const };
      if (parsed.data.reportsToMemberId) {
        const target = await tx.organizationMember.findFirst({
          where: { id: parsed.data.reportsToMemberId, organizationId: context.organizationId, isActive: true },
          select: { id: true },
        });
        if (!target) return { kind: "reporting-target" as const };
        const members = await tx.organizationMember.findMany({
          where: { organizationId: context.organizationId, isActive: true },
          select: { id: true, reportsToMemberId: true },
        });
        const managerByMember = new Map(members.map((member) => [member.id, member.reportsToMemberId]));
        let ancestor: string | null | undefined = parsed.data.reportsToMemberId;
        const visited = new Set<string>();
        while (ancestor) {
          if (ancestor === memberId || visited.has(ancestor)) return { kind: "reporting-cycle" as const };
          visited.add(ancestor);
          ancestor = managerByMember.get(ancestor);
        }
      }
    }
    const metadataResult = parsed.data.metadata !== undefined && parsed.data.metadata !== null
      ? await prepareMetadataValues(context.organizationId, "member", parsed.data.metadata, before.metadata, tx)
      : null;
    if (metadataResult?.error) {
      return { kind: "metadata" as const, message: metadataResult.error };
    }

    const roleWillChange = parsed.data.role !== undefined && parsed.data.role !== before.role;
    const assigningOwner = parsed.data.role === MemberRole.OWNER && before.role !== MemberRole.OWNER;
    const isDeactivatingOwner = before.role === MemberRole.OWNER &&
      ((parsed.data.role !== undefined && parsed.data.role !== MemberRole.OWNER) || parsed.data.isActive === false);
    if ((isDeactivatingOwner || assigningOwner) && !roleAtLeast(context.role, "OWNER")) {
      return { kind: "owner" as const };
    }
    if (isDeactivatingOwner) {
      const ownerCount = await tx.organizationMember.count({
        where: { organizationId: context.organizationId, role: MemberRole.OWNER, isActive: true },
      });
      if (ownerCount <= 1) return { kind: "last-owner" as const };
    }

    const { metadata, skills, certifications, ...data } = parsed.data;
    const beforeSkills = skills !== undefined
      ? await tx.memberSkill.findMany({ where: { organizationId: context.organizationId, memberId }, orderBy: { name: "asc" } })
      : [];
    const beforeCertifications = certifications !== undefined
      ? await tx.memberCertification.findMany({ where: { organizationId: context.organizationId, memberId }, orderBy: { name: "asc" } })
      : [];
    if (skills !== undefined) {
      const normalized = skills.map((skill) => ({ ...skill, name: skill.name.trim() }));
      if (new Set(normalized.map(({ name }) => name.toLowerCase())).size !== normalized.length) {
        return { kind: "duplicate-skill" as const };
      }
      await tx.memberSkill.deleteMany({ where: { organizationId: context.organizationId, memberId } });
      if (normalized.length) {
        await tx.memberSkill.createMany({
          data: normalized.map((skill) => ({
            organizationId: context.organizationId,
            memberId,
            name: skill.name,
            level: skill.level,
            yearsExperience: skill.yearsExperience ?? null,
          })),
        });
      }
    }
    if (certifications !== undefined) {
      const normalized = certifications.map((certification) => ({ ...certification, name: certification.name.trim() }));
      if (new Set(normalized.map(({ name }) => name.toLowerCase())).size !== normalized.length) {
        return { kind: "duplicate-certification" as const };
      }
      await tx.memberCertification.deleteMany({ where: { organizationId: context.organizationId, memberId } });
      if (normalized.length) {
        await tx.memberCertification.createMany({
          data: normalized.map((certification) => ({
            organizationId: context.organizationId,
            memberId,
            name: certification.name,
            issuer: certification.issuer ?? null,
            issuedOn: certification.issuedOn ?? null,
            expiresOn: certification.expiresOn ?? null,
            credentialId: certification.credentialId ?? null,
          })),
        });
      }
    }
    const next = await tx.organizationMember.update({
      where: { id_organizationId: { id: memberId, organizationId: context.organizationId } },
      data: {
        ...data,
        ...(Object.hasOwn(parsed.data, "metadata")
          ? { metadata: metadata === null ? Prisma.DbNull : metadataResult?.values ?? metadata }
          : {}),
      },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: roleWillChange ? AuditAction.ROLE_CHANGE : AuditAction.UPDATE,
      entityType: "organization_member",
      entityId: memberId,
      before: memberSnapshot(before),
      after: memberSnapshot(next),
      ...(skills !== undefined || certifications !== undefined ? {
        before: {
          ...memberSnapshot(before),
          ...(skills !== undefined ? { skills: beforeSkills.map(({ name, level, yearsExperience }) => ({ name, level, yearsExperience })) } : {}),
          ...(certifications !== undefined ? { certifications: beforeCertifications.map(({ name, issuer, issuedOn, expiresOn, credentialId }) => ({ name, issuer, issuedOn: issuedOn?.toISOString().slice(0, 10) ?? null, expiresOn: expiresOn?.toISOString().slice(0, 10) ?? null, credentialId })) } : {}),
        },
        after: {
          ...memberSnapshot(next),
          ...(skills !== undefined ? { skills: skills.map(({ name, level, yearsExperience }) => ({ name, level, yearsExperience: yearsExperience ?? null })) } : {}),
          ...(certifications !== undefined ? { certifications: certifications.map(({ name, issuer, issuedOn, expiresOn, credentialId }) => ({ name, issuer: issuer ?? null, issuedOn: issuedOn?.toISOString().slice(0, 10) ?? null, expiresOn: expiresOn?.toISOString().slice(0, 10) ?? null, credentialId: credentialId ?? null })) } : {}),
        },
      } : {}),
      userAgent: request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const, data: next };
  });

  if (updated.kind === "missing") {
    return NextResponse.json({ error: "Member not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (updated.kind === "owner") {
    return NextResponse.json({ error: "Only an owner can change another owner's membership.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (updated.kind === "reporting-target") {
    return NextResponse.json({ error: "Choose an active manager from this organization.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (updated.kind === "reporting-cycle") {
    return NextResponse.json({ error: "That reporting line would create a cycle.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (updated.kind === "duplicate-skill") {
    return NextResponse.json({ error: "Skill names must be unique for this member.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (updated.kind === "duplicate-certification") {
    return NextResponse.json({ error: "Certification names must be unique for this member.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (updated.kind === "last-owner") {
    return NextResponse.json({ error: "Transfer ownership before removing the last active owner.", code: "LAST_OWNER" }, { status: 422 });
  }
  if (updated.kind === "metadata") {
    return NextResponse.json({ error: updated.message, code: "VALIDATION_ERROR", field: "metadata" }, { status: 422 });
  }
  return NextResponse.json({ data: updated.data });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { context, response } = await requireTenantRole("ADMIN");
  if (response) return response;
  const { memberId } = await params;

  const result = await db.$transaction(async (tx) => {
    const before = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId: context.organizationId },
    });
    if (!before) return { kind: "missing" as const };
    if (before.role === MemberRole.OWNER && !roleAtLeast(context.role, MemberRole.OWNER)) {
      return { kind: "owner" as const };
    }
    if (before.role === MemberRole.OWNER && before.isActive) {
      const ownerCount = await tx.organizationMember.count({
        where: { organizationId: context.organizationId, role: MemberRole.OWNER, isActive: true },
      });
      if (ownerCount <= 1) return { kind: "last-owner" as const };
    }

    const updated = await tx.organizationMember.update({
      where: { id_organizationId: { id: memberId, organizationId: context.organizationId } },
      data: { isActive: false },
    });
    await createAuditEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      action: AuditAction.UPDATE,
      entityType: "organization_member",
      entityId: memberId,
      before: memberSnapshot(before),
      after: memberSnapshot(updated),
      userAgent: _request.headers.get("user-agent"),
    }, tx);
    return { kind: "updated" as const };
  });

  if (result.kind === "missing") {
    return NextResponse.json({ error: "Member not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.kind === "owner") {
    return NextResponse.json({ error: "An owner cannot be deactivated by an administrator.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (result.kind === "last-owner") {
    return NextResponse.json({ error: "Transfer ownership before deactivating the last active owner.", code: "LAST_OWNER" }, { status: 422 });
  }
  return NextResponse.json({ data: { id: memberId, isActive: false } });
}
