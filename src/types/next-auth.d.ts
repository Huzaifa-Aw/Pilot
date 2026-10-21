import type { MemberRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      activeOrganizationId: string | null;
      role: MemberRole | null;
    } & DefaultSession["user"];
  }

  interface User {
    activeOrganizationId?: string | null;
    role?: MemberRole | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    activeOrganizationId?: string | null;
    role?: MemberRole | null;
  }
}
