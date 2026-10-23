"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button variant="secondary" onClick={() => void signOut({ redirectTo: "/login" })}>
      <LogOut aria-hidden="true" />
      Sign out
    </Button>
  );
}
