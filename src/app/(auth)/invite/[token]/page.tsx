import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { BrandMark } from "@/components/layout/brand-mark";
import { InvitationAcceptForm } from "@/components/forms/invitation-accept-form";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await db.invitation.findUnique({
    where: { tokenHash },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      organization: { select: { name: true } },
    },
  });

  if (!invitation || invitation.acceptedAt) {
    return <InvitationMessage title="Invitation unavailable" detail="This invitation was already used or is no longer available." />;
  }
  if (invitation.expiresAt <= new Date()) {
    return <InvitationMessage title="Invitation expired" detail="Ask an organization administrator to send you a new invitation." />;
  }

  const session = await auth();
  if (session?.user?.email && session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <InvitationMessage
        title="Sign in with the invited email"
        detail={`This invitation was sent to ${invitation.email}. Sign out and sign in with that address to accept it.`}
      />
    );
  }
  if (!session?.user?.id) {
    const existingUser = await db.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existingUser) {
      return (
        <InvitationMessage
          title="Sign in to accept"
          detail={`An account already exists for ${invitation.email}. Sign in with that account, then return to accept this invitation.`}
          href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
        />
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-6 sm:px-8">
      <Link href="/" className="inline-flex min-h-11 w-fit items-center gap-3 rounded-md">
        <BrandMark />
        <span className="font-heading text-base font-semibold">Workspace</span>
      </Link>
      <section className="my-auto py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Organization invitation</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-text-primary">
          Join {invitation.organization.name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Accept as <span className="font-medium text-text-primary">{invitation.email}</span> with the{" "}
          <span className="font-medium text-text-primary">{invitation.role.toLowerCase()}</span> role.
        </p>
        {!session?.user && (
          <p className="mt-3 text-sm text-text-secondary">
            Already have an account?{" "}
            <Link className="font-semibold text-brand-primary hover:underline" href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}>
              Sign in first
            </Link>
          </p>
        )}
        <div className="mt-8">
          <InvitationAcceptForm
            token={token}
            email={invitation.email}
            signedIn={Boolean(session?.user?.id)}
          />
        </div>
      </section>
    </main>
  );
}

function InvitationMessage({
  title,
  detail,
  href = "/login",
}: {
  title: string;
  detail: string;
  href?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-6 sm:px-8">
      <Link href="/" className="inline-flex min-h-11 w-fit items-center gap-3 rounded-md">
        <BrandMark />
        <span className="font-heading text-base font-semibold">Workspace</span>
      </Link>
      <section className="my-auto py-12">
        <h1 className="font-heading text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">{detail}</p>
        <Link href={href} className="mt-5 inline-flex min-h-11 items-center rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-600">
          Sign in to accept
        </Link>
      </section>
    </main>
  );
}
