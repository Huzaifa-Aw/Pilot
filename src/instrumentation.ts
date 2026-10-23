import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const correlationId = crypto.randomUUID();
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.error("Unhandled application error.", { correlationId, route: context.routePath, errorName });
    return;
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("Unhandled application error could not be associated with a session because AUTH_SECRET is missing.", { correlationId, route: context.routePath, errorName });
      return;
    }
    const [{ getToken }, { AuditAction, AuditFailureCategory }, { createAuditFailureEvent }] = await Promise.all([
      import("next-auth/jwt"),
      import("@prisma/client"),
      import("@/lib/audit"),
    ]);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) headers.set(key, typeof value === "string" ? value : value?.join(", ") ?? "");
    const requestUrl = new URL(request.path ?? "/", "https://workspace.invalid");
    const token = await getToken({
      req: new Request(requestUrl, { method: request.method ?? "GET", headers }),
      secret,
      secureCookie: process.env.NODE_ENV === "production",
    });
    const organizationId = typeof token?.activeOrganizationId === "string" ? token.activeOrganizationId : null;
    const actorId = token?.sub ?? null;
    if (!organizationId || !actorId) {
      console.error("Unhandled application error without an authenticated organization.", { correlationId, route: context.routePath, errorName });
      return;
    }
    await createAuditFailureEvent({
      organizationId,
      actorId,
      action: AuditAction.ERROR,
      entityType: "application_request",
      category: AuditFailureCategory.APPLICATION_ERROR,
      errorCode: "UNHANDLED_SERVER_ERROR",
      summary: `An unexpected server error occurred in ${context.routePath}.`,
      correlationId,
      userAgent: request.headers["user-agent"]?.toString() ?? null,
    });
    console.error("Unhandled application error.", { correlationId, route: context.routePath, errorName });
  } catch (auditError) {
    console.error("Unable to audit an unhandled application error.", { correlationId, route: context.routePath, auditError });
  }
};
