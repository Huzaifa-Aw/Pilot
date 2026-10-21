import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SetupForm } from "@/components/forms/setup-form";

export const metadata: Metadata = { title: "Set up your workspace" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const configured = await db.bootstrapState.findUnique({
    where: { id: "global" },
    select: { id: true },
  });
  if (configured) redirect("/login");

  return (
    <div className="w-full">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
        First-time setup
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
        Create your workspace
      </h1>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        Set up your organization and owner account. This one-time setup is only
        available before the first organization is created.
      </p>
      <div className="mt-8">
        <SetupForm />
      </div>
    </div>
  );
}
