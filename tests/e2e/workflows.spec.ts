import { expect, test, type Page } from "@playwright/test";

const password = process.env.E2E_TEST_PASSWORD ?? "E2E-Only-Password-2026";

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/overview", { timeout: 10_000 });
}

async function api(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }, { path, method, body });
}

test("projects, worklogs, approvals, allocations, deployments, and assets work end-to-end", async ({ page }) => {
  await login(page, "e2e-manager@example.test");
  const [memberResponse, projectResponse] = await Promise.all([
    api(page, "/api/members"),
    api(page, "/api/projects"),
  ]);
  const engineer = memberResponse.data.data.find((member: { role: string }) => member.role === "ENGINEER");
  const manager = memberResponse.data.data.find((member: { role: string }) => member.role === "MANAGER");
  const sharedProject = projectResponse.data.data.find((project: { code: string }) => project.code === "E2E-SHARED");
  const secondProject = projectResponse.data.data.find((project: { code: string }) => project.code === "E2E-SECOND");
  expect(engineer).toBeTruthy();
  expect(manager).toBeTruthy();
  expect(sharedProject).toBeTruthy();
  expect(secondProject).toBeTruthy();

  const week = new Date();
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const weekStartDate = week.toISOString().slice(0, 10);
  const weekEnd = new Date(week);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndDate = weekEnd.toISOString().slice(0, 10);
  const planned = await api(page, `/api/projects/${sharedProject.id}/allocations`, "POST", {
    memberId: engineer.id,
    startDate: weekStartDate,
    endDate: weekEndDate,
    plannedHrs: 28,
    allocationPct: 70,
    mode: "Remote",
  });
  expect(planned.status).toBe(201);
  expect((await page.goto("/members?tab=allocations"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "People & allocations" })).toBeVisible();
  await page.getByText("Edit this allocation").click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  expect((await page.goto(`/members/${engineer.id}`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "E2E Engineer" })).toBeVisible();
  await expect(page.getByText("Change here")).toBeVisible();
  const overAllocated = await api(page, `/api/projects/${secondProject.id}/allocations`, "POST", {
    memberId: engineer.id,
    startDate: weekStartDate,
    endDate: weekEndDate,
    plannedHrs: 16,
    allocationPct: 40,
    mode: "Remote",
  });
  expect(overAllocated.status).toBe(422);
  expect(overAllocated.data.code).toBe("OVERALLOCATION");

  const milestone = await api(page, `/api/projects/${sharedProject.id}/milestones`, "POST", {
    title: "E2E schedule checkpoint",
    startDate: new Date().toISOString().slice(0, 10),
    targetDate: new Date().toISOString().slice(0, 10),
  });
  expect(milestone.status).toBe(201);
  const milestoneUpdate = await api(page, `/api/projects/${sharedProject.id}/milestones/${milestone.data.data.id}`, "PATCH", {
    title: "E2E schedule checkpoint updated",
    updatedAt: milestone.data.data.updatedAt,
  });
  expect(milestoneUpdate.status).toBe(200);

  const task = await api(page, `/api/projects/${sharedProject.id}/tasks`, "POST", {
    title: "E2E editable task",
    priority: "HIGH",
    milestoneId: milestone.data.data.id,
    assigneeIds: [engineer.id],
  });
  expect(task.status).toBe(201);
  const taskUpdate = await api(page, `/api/projects/${sharedProject.id}/tasks/${task.data.data.id}`, "PATCH", {
    title: "E2E editable task updated",
    updatedAt: task.data.data.updatedAt,
  });
  expect(taskUpdate.status).toBe(200);
  const taskDelete = await api(page, `/api/projects/${sharedProject.id}/tasks/${task.data.data.id}`, "DELETE");
  expect(taskDelete.status).toBe(200);
  expect((await api(page, `/api/projects/${sharedProject.id}/milestones/${milestone.data.data.id}`, "DELETE")).status).toBe(200);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const deployment = await api(page, "/api/deployments", "POST", {
    memberIds: [engineer.id],
    projectId: sharedProject.id,
    title: "E2E site assignment",
    deploymentType: "On-site",
    location: "Test location",
    startDate: today,
    endDate: tomorrow,
    status: "UPCOMING",
  });
  expect(deployment.status).toBe(201);
  expect(deployment.data.data.conflictFlags).toHaveLength(1);
  const deploymentId = deployment.data.data.id;
  const teamDeployments = await api(page, `/api/deployments?memberId=${engineer.id}`);
  expect(teamDeployments.status).toBe(200);
  expect(teamDeployments.data.data.some((item: { id: string }) => item.id === deploymentId)).toBe(true);
  const deploymentUpdate = await api(page, `/api/deployments/${deploymentId}`, "PATCH", {
    title: "Updated E2E site assignment",
    status: "ACTIVE",
    memberIds: [engineer.id],
  });
  expect(deploymentUpdate.status).toBe(200);
  expect((await page.goto(`/deployments/${deploymentId}/edit`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Edit deployment" })).toBeVisible();

  const asset = await api(page, "/api/assets", "POST", {
    assetCode: "E2E-TOOL",
    title: "E2E shared inspection tool",
    category: "Tools",
    status: "ACTIVE",
    location: "Test store",
  });
  expect(asset.status).toBe(201);
  const checkout = await api(page, `/api/assets/${asset.data.data.id}/checkout`, "POST", {
    action: "checkout",
    memberId: engineer.id,
    projectId: sharedProject.id,
    deploymentId,
    notes: "Playwright verification",
  });
  expect(checkout.status).toBe(201);
  expect((await api(page, `/api/assets?status=IN_USE&memberId=${engineer.id}&projectId=${sharedProject.id}`)).data.data.some((item: { id: string }) => item.id === asset.data.data.id)).toBe(true);
  expect((await api(page, `/api/assets/${asset.data.data.id}/checkout`, "POST", { action: "return" })).status).toBe(200);

  const csv = await api(page, "/api/assets/import", "POST", { csv: "assetCode,title,category,status\nE2E-CSV,\"CSV tool, set\",Tools,ACTIVE", mode: "commit" });
  expect(csv.status).toBe(200);
  expect(csv.data.data.created).toBe(1);
  expect((await page.goto("/reports"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Portfolio timeline" })).toBeVisible();

  await login(page, "e2e-engineer@example.test");
  const outOfScopeDeployments = await api(page, `/api/deployments?memberId=${manager.id}`);
  expect(outOfScopeDeployments.status).toBe(403);
  const board = await api(page, "/api/board/tasks");
  const sharedTask = board.data.data.find((item: { title: string; projectId: string }) =>
    item.title === "Shared board verification task" && item.projectId === sharedProject.id,
  );
  expect(sharedTask).toBeTruthy();
  const worklog = await api(page, "/api/worklogs", "POST", {
    projectId: sharedProject.id,
    taskId: sharedTask.id,
    date: today,
    hours: 1.5,
    description: "E2E monthly time entry",
  });
  expect(worklog.status).toBe(201);
  const month = today.slice(0, 7);
  const monthResponse = await api(page, `/api/worklogs?month=${month}`);
  expect(monthResponse.data.data.some((entry: { id: string }) => entry.id === worklog.data.data.id)).toBe(true);
  expect(monthResponse.data.period.status).toBe("OPEN");
  const submitted = await api(page, `/api/timesheet-periods/${monthResponse.data.period.id}`, "PATCH", { status: "SUBMITTED" });
  expect(submitted.status).toBe(200);
  expect(submitted.data.data.status).toBe("SUBMITTED");

  await login(page, "e2e-manager@example.test");
  const approved = await api(page, `/api/timesheet-periods/${monthResponse.data.period.id}`, "PATCH", { status: "APPROVED" });
  expect(approved.status).toBe(200);
  expect(approved.data.data.status).toBe("APPROVED");

  await login(page, "e2e-engineer@example.test");
  const lockedWorklog = await api(page, "/api/worklogs", "POST", {
    projectId: sharedProject.id,
    taskId: sharedTask.id,
    date: today,
    hours: 0.5,
    description: "This entry should be blocked after approval",
  });
  expect(lockedWorklog.status).toBe(409);
  expect(lockedWorklog.data.code).toBe("TIMESHEET_LOCKED");
});
