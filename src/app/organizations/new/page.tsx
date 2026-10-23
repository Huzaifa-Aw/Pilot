import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { OrganizationForm } from "@/components/forms/organization-form";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an organization" };

export default async function NewOrganizationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 w-fit items-center gap-3 rounded-md">
          <BrandMark />
          <span className="font-heading text-base font-semibold">Workspace</span>
        </Link>
        <SignOutButton />
      </header>
      <section className="my-auto py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">New organization</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-text-primary">Create a workspace</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Organize a separate team and its projects, members, and work.
        </p>
        <div className="mt-8">
          <OrganizationForm />
        </div>
      </section>
    </main>
  );
}
