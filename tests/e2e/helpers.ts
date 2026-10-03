import { expect, type Browser, type Page } from "@playwright/test";

export async function login(browser: Browser, email: string, password = "password123"): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

/** Navigate and wait until the page has settled, so the first click lands on hydrated forms (dev compiles pages on demand). */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

export async function createCourse(page: Page, code: string, role: "TA" | "Instructor") {
  await open(page, "/courses/new");
  await page.getByLabel("Course code").fill(code);
  await page.getByLabel("Title").fill(`${code} Title`);
  await page.getByLabel("Term").fill("Fall 2026");
  await page.getByLabel(role === "TA" ? "Teaching assistant" : "Instructor").check();
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/manage\/roster/);
  return page.url().match(/courses\/([^/]+)/)![1];
}

export async function importRoster(page: Page, csv: string) {
  await page.getByLabel("Or paste").fill(csv);
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("button", { name: /^Import \d+ change/ }).click();
  await expect(page.getByText(/Roster imported/)).toBeVisible();
}

/** Create a 2-row rubric assignment, add one hour of slots (09:00 by default) on the first demo day, and open booking. */
export async function createPublishedAssignment(page: Page, courseId: string, title: string, hours: { from: string; to: string } = { from: "09:00", to: "10:00" }) {
  await open(page, `/courses/${courseId}/manage/assignments/new`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add rubric row" }).click();
  await page.getByRole("button", { name: "Add rubric row" }).click();
  await page.getByLabel("Criterion").nth(0).fill("Functionality");
  await page.getByLabel("Points").nth(0).fill("6");
  await page.getByLabel("Criterion").nth(1).fill("Code quality");
  await page.getByLabel("Points").nth(1).fill("4");
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("heading", { name: "Add slots" })).toBeVisible();

  // First day of the demo window, one hour.
  await page.getByRole("group", { name: "Days" }).getByRole("button", { disabled: false }).first().click();
  await page.getByLabel("From", { exact: true }).fill(hours.from);
  await page.getByLabel("To", { exact: true }).fill(hours.to);
  await page.getByRole("button", { name: "Add 4 slots" }).click();
  await expect(page.getByText(/4 slots added\. Students can book them once you open booking\./)).toBeVisible();
  await page.getByRole("button", { name: "Open booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open booking" }).click();
  await expect(page.getByText("Booking is open — students have been notified.")).toBeVisible();
  return page.url().split("/").pop()!;
}
