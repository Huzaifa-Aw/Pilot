import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  await db.organization.findFirst({ select: { id: true } });
  return NextResponse.json({ status: "ok" });
}
