import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});

const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const user = await db.user.findUnique({
        where: { email: parsed.data.email },
        include: {
          memberships: {
            where: { isActive: true, organization: { isActive: true } },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });

      if (!user?.passwordHash || user.memberships.length === 0) return null;
      if (!(await compare(parsed.data.password, user.passwordHash))) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        activeOrganizationId: user.memberships[0].organizationId,
        role: user.memberships[0].role,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
        token.activeOrganizationId = user.activeOrganizationId ?? null;
        token.role = user.role ?? null;
      }

      if (trigger === "update" && session?.activeOrganizationId && token.sub) {
        const membership = await db.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: session.activeOrganizationId,
              userId: token.sub,
            },
            isActive: true,
            organization: { isActive: true },
          },
          select: { organizationId: true, role: true },
        });

        if (membership) {
          token.activeOrganizationId = membership.organizationId;
          token.role = membership.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.activeOrganizationId = token.activeOrganizationId ?? null;
        session.user.role = token.role ?? null;
      }
      return session;
    },
  },
});
