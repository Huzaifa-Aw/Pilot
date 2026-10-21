import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const redirectTo =
    params.callbackUrl?.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/overview";

  return (
    <div className="w-full">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
        Welcome back
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
        Sign in to your workspace
      </h1>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        Use the email address and password associated with your organization.
      </p>
      {params.setup === "complete" && (
        <p role="status" className="mt-5 rounded-md border border-success-light bg-success-light px-4 py-3 text-sm text-success-dark">
          Workspace created. Sign in with your owner account to continue.
        </p>
      )}
      {params.error && (
        <p role="alert" className="mt-5 rounded-md border border-error-light bg-error-light px-4 py-3 text-sm text-error-dark">
          We couldn&apos;t sign you in. Check your email and password and try again.
        </p>
      )}
      <div className="mt-8">
        <LoginForm
          redirectTo={redirectTo}
          googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
        />
      </div>
      <p className="mt-6 text-center text-sm text-text-secondary">
        Need access? Ask your organization administrator for an invitation.
      </p>
    </div>
  );
}
