import { NextRequest, NextResponse } from "next/server";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { requireCapability } from "@/lib/api";
import { db } from "@/lib/db";
import { idSchema } from "@/lib/validations/shared";

export async function GET(request: NextRequest) {
  const { context, response } = await requireCapability("board.read");
  if (response) return response;
  const params = request.nextUrl.searchParams;
  const projectId = params.get("project");
  const assigneeId = params.get("assignee");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const status = params.get("status");
  const priority = params.get("priority");
  const search = params.get("q")?.trim().slice(0, 120);
  const milestoneId = params.get("milestone");
  const dueFromValue = params.get("dueFrom");
  const dueToValue = params.get("dueTo");
  const mine = params.get("mine");
  const dueFrom = dueFromValue ? new Date(dueFromValue) : null;
  const dueTo = dueToValue ? new Date(dueToValue) : null;
  if ((projectId && !idSchema.safeParse(projectId).success) ||
      (assigneeId && !idSchema.safeParse(assigneeId).success) ||
      (milestoneId && !idSchema.safeParse(milestoneId).success) ||
      (status && !Object.values(TaskStatus).includes(status as TaskStatus)) ||
      (priority && !Object.values(TaskPriority).includes(priority as TaskPriority)) ||
      (mine && mine !== "true" && mine !== "false") ||
      (dueFromValue && Number.isNaN(dueFrom?.getTime())) ||
      (dueToValue && Number.isNaN(dueTo?.getTime()))) {
    return NextResponse.json({ error: "Choose valid board filters.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const assignmentFilters = [
    ...(assigneeId ? [{ assignments: { some: { memberId: assigneeId } } }] : []),
    ...(mine === "true" ? [{ assignments: { some: { memberId: context.memberId } } }] : []),
  ];

  const tasks = await db.task.findMany({
    where: {
      organizationId: context.organizationId,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status: status as TaskStatus } : {}),
      ...(priority ? { priority: priority as TaskPriority } : {}),
      ...(milestoneId ? { milestoneId } : {}),
      ...(assignmentFilters.length ? { AND: assignmentFilters } : {}),
      ...(dueFrom || dueTo ? { dueDate: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } } : {}),
      ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { priority: "desc" }, { dueDate: "asc" }],
    select: {
      id: true,
      projectId: true,
      taskNumber: true,
      title: true,
      status: true,
      sortOrder: true,
      priority: true,
      dueDate: true,
      estimatedHrs: true,
      actualHrs: true,
      requiredDiscipline: true,
      project: { select: { id: true, code: true, title: true } },
      milestone: { select: { id: true, title: true } },
      assignments: {
        include: {
          member: {
            select: {
              id: true,
              discipline: true,
              user: { select: { name: true, image: true } },
              deploymentMemberships: {
                where: {
                  organizationId: context.organizationId,
                  deployment: { status: { in: ["ACTIVE", "UPCOMING"] }, startDate: { lte: today }, endDate: { gte: today } },
                },
                select: { deployment: { select: { status: true, startDate: true, endDate: true, location: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: tasks });
}
