"use client";

import { signIn } from "next-auth/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({
  redirectTo = "/overview",
  googleEnabled = false,
}: {
  redirectTo?: string;
  googleEnabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo,
        redirect: false,
      });

      if (!result || result.error) {
        setError("We couldn't sign you in. Check your email and password and try again.");
        return;
      }

      window.location.assign(result.url ?? "/overview");
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
    >
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-text-secondary">Email</label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text-secondary">Password</label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
        {pending ? "Signing in..." : "Sign in"}
      </Button>
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border-default" />
            or
            <span className="h-px flex-1 bg-border-default" />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => void signIn("google", { redirectTo })}
          >
            Continue with Google
          </Button>
        </>
      )}
    </form>
  );
}
