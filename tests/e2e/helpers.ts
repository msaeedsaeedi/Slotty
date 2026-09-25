import { expect, type Browser, type Page } from "@playwright/test";

export async function login(browser: Browser, email: string, password = "password123"): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

export async function createCourse(page: Page, code: string, role: "TA" | "Instructor") {
  await page.goto("/courses/new");
  await page.getByLabel("Course code").fill(code);
  await page.getByLabel("Title").fill(`${code} Title`);
  await page.getByLabel("Term").fill("Fall 2026");
  await page.getByLabel("Timezone").fill("UTC");
  await page.getByLabel(role === "TA" ? "Teaching assistant" : "Instructor").check();
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/manage\/roster/);
  return page.url().match(/courses\/([^/]+)/)![1];
}

export async function importRoster(page: Page, csv: string) {
  await page.getByLabel("…or paste it").fill(csv);
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("button", { name: /^Import \d+ change/ }).click();
  await expect(page.getByText(/Roster imported/)).toBeVisible();
}

/** Create a 2-row rubric assignment, add 09:00–10:00 availability on the first demo day, and publish. */
export async function createPublishedAssignment(page: Page, courseId: string, title: string) {
  await page.goto(`/courses/${courseId}/manage/assignments/new`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add rubric row" }).click();
  await page.getByRole("button", { name: "Add rubric row" }).click();
  await page.getByLabel("Criterion").nth(0).fill("Functionality");
  await page.getByLabel("Points").nth(0).fill("6");
  await page.getByLabel("Criterion").nth(1).fill("Code quality");
  await page.getByLabel("Points").nth(1).fill("4");
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("button", { name: "Generate slots" })).toBeVisible();

  await page.getByLabel("From", { exact: true }).fill("09:00");
  await page.getByLabel("To", { exact: true }).fill("10:00");
  await page.getByRole("button", { name: "Generate slots" }).click();
  await expect(page.getByText("4 slots created as drafts.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published — students have been notified/)).toBeVisible();
  return page.url().split("/").pop()!;
}
