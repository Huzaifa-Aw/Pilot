"use client";

import { signIn } from "next-auth/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InvitationAcceptForm({
  token,
  email,
  signedIn,
}: {
  token: string;
  email: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    setPending(true);
    const name = String(formData.get("name") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ...(signedIn ? {} : { name, password }) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Invitation couldn't be accepted.");
        setPending(false);
        return;
      }

      if (!signedIn) {
        await signIn("credentials", { email, password, redirectTo: "/overview" });
        return;
      }
      router.replace("/overview");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Try again or sign in to accept the invitation.");
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
      {!signedIn && (
        <>
          <div className="space-y-2">
            <label htmlFor="invite-name" className="text-sm font-medium text-text-secondary">Full name</label>
            <Input id="invite-name" name="name" autoComplete="name" minLength={2} maxLength={120} required />
          </div>
          <div className="space-y-2">
            <label htmlFor="invite-password" className="text-sm font-medium text-text-secondary">Create a password</label>
            <Input id="invite-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <p className="text-xs text-text-muted">Use at least 12 characters.</p>
          </div>
        </>
      )}
      {error && <p role="alert" className="rounded-md border border-error-light bg-error-light px-3 py-2.5 text-sm text-error-dark">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        {pending ? "Accepting invitation..." : "Accept invitation"}
      </Button>
    </form>
  );
}
