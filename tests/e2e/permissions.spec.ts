import { expect, test } from "@playwright/test";

const password = process.env.E2E_TEST_PASSWORD ?? "E2E-Only-Password-2026";
const roles = [
  { email: "e2e-owner@example.test", role: "OWNER", canManage: true, canReport: true },
  { email: "e2e-admin@example.test", role: "ADMIN", canManage: true, canReport: true },
  { email: "e2e-manager@example.test", role: "MANAGER", canManage: true, canReport: true },
  { email: "e2e-engineer@example.test", role: "ENGINEER", canManage: false, canReport: false },
  { email: "e2e-viewer@example.test", role: "VIEWER", canManage: false, canReport: false },
] as const;

test("every role sees the same shared board while mutations follow project scope", async ({ page }) => {
  const counts = new Map<string, number>();
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|didn't match/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  for (const account of roles) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(account.email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/overview", { timeout: 10_000 });

    const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
    expect(session.user.role).toBe(account.role);
    await page.goto("/board");
    await expect(page.getByRole("heading", { name: "Task board" })).toBeVisible();
    expect(hydrationErrors).toEqual([]);
    const board = await page.evaluate(async () => (await fetch("/api/board/tasks")).json());
    expect(board.data.some((task: { title: string }) => task.title === "Shared board verification task")).toBe(true);
    counts.set(account.role, board.data.length);

    const target = board.data.find((task: { title: string }) => task.title === "Shared board verification task");
    const updateStatus = async (status: string) => page.evaluate(async ({ projectId, taskId, nextStatus }) => {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      return response.status;
    }, { projectId: target.projectId, taskId: target.id, nextStatus: status });

    if (account.role === "VIEWER") {
      expect(await updateStatus("COMPLETED")).toBe(403);
      await expect(page.getByRole("button", { name: /Move Shared board verification task/ })).toHaveCount(0);
    } else if (account.role === "ENGINEER") {
      expect(await updateStatus("IN_PROGRESS")).toBe(200);
      expect(await updateStatus("BACKLOG")).toBe(200);
    } else {
      expect(await updateStatus("UNDER_REVIEW")).toBe(200);
      expect(await updateStatus("BACKLOG")).toBe(200);
    }

    if (account.canReport) {
      await page.goto("/reports");
      await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    } else {
      expect((await page.goto("/reports"))?.status()).toBe(404);
    }

    if (account.role === "ADMIN" || account.role === "OWNER") {
      await page.goto("/settings/general");
      await expect(page.getByRole("heading", { name: "Organization profile" })).toBeVisible();
    } else {
      await page.goto("/settings/general");
      await expect(page).toHaveURL(/\/overview$/);
    }
  }
  expect(new Set(counts.values()).size).toBe(1);
});

test("mobile navigation exposes the shared board", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("e2e-viewer@example.test");
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/overview", { timeout: 10_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Board", exact: true })).toBeVisible();
});
