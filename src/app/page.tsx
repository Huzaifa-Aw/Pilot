import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HomePage() {
  const bootstrap = await db.bootstrapState.findUnique({
    where: { id: "global" },
    select: { id: true },
  });

  if (!bootstrap) redirect("/setup");

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.activeOrganizationId) redirect("/organizations/new");

  redirect("/overview");
}
