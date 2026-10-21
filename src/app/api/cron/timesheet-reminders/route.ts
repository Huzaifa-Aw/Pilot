import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { TimesheetPeriodStatus } from "@prisma/client";

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured.", code: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "A valid cron bearer token is required.", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [members, periods, sent] = await Promise.all([
    db.organizationMember.findMany({
      where: { isActive: true, organization: { isActive: true } },
      select: { id: true, organizationId: true },
    }),
    db.timesheetPeriod.findMany({
      where: { monthStart },
      select: { organizationId: true, memberId: true, status: true },
    }),
    db.notification.findMany({
      where: { type: "TIMESHEET_REMINDER", createdAt: { gte: monthStart, lt: nextMonth } },
      select: { organizationId: true, memberId: true },
    }),
  ]);
  const periodByMember = new Map(periods.map((period) => [`${period.organizationId}:${period.memberId}`, period.status]));
  const sentKeys = new Set(sent.map((item) => `${item.organizationId}:${item.memberId}`));
  const toNotify = members.filter(({ organizationId, id }) => {
    const key = `${organizationId}:${id}`;
    const status = periodByMember.get(key);
    return !sentKeys.has(key) && status !== TimesheetPeriodStatus.SUBMITTED && status !== TimesheetPeriodStatus.APPROVED;
  });
  if (toNotify.length) {
    await db.notification.createMany({
      data: toNotify.map(({ organizationId, id }) => ({
        organizationId,
        memberId: id,
        type: "TIMESHEET_REMINDER",
        dedupeKey: monthStart.toISOString().slice(0, 7),
        payload: { month: monthStart.toISOString().slice(0, 7), message: `Please complete your ${monthStart.toLocaleString("en", { month: "long", timeZone: "UTC" })} timesheet.` },
      })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ data: { remindersCreated: toNotify.length, month: monthStart.toISOString().slice(0, 7) } });
}
