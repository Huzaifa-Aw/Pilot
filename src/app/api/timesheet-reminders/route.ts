import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireTenantRole } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { z } from "zod";

const reminderSchema = z.object({
  memberId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  const { context, response } = await requireTenantRole("MANAGER");
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    throw error;
  }
  const parsed = reminderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a team member and month.", code: "VALIDATION_ERROR" }, { status: 422 });
  if (!(await can(context, "timesheet.team", { memberId: parsed.data.memberId }))) {
    return NextResponse.json({ error: "You can remind only people in your reporting tree.", code: "FORBIDDEN" }, { status: 403 });
  }
  const monthStart = new Date(`${parsed.data.month}-01T00:00:00.000Z`);
  if (Number.isNaN(monthStart.getTime())) return NextResponse.json({ error: "Choose a valid month.", code: "VALIDATION_ERROR" }, { status: 422 });

  const notification = await db.notification.create({
    data: {
      organizationId: context.organizationId,
      memberId: parsed.data.memberId,
      type: "TIMESHEET_REMINDER",
      dedupeKey: `manual:${randomUUID()}`,
      payload: { month: parsed.data.month, message: `Please complete your ${parsed.data.month} timesheet.` },
    },
  });
  return NextResponse.json({ data: notification }, { status: 201 });
}
