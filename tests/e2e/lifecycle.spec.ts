import { expect, test } from "@playwright/test";
import { createCourse, createPublishedAssignment, importRoster, login } from "./helpers";

test("TA runs the whole loop alone: roster → slots → booking → marking → student sees marks → export", async ({ browser }) => {
  // TA sets up the course and imports a new student by email.
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "SOLO101", "TA");
  await importRoster(ta, "email,name\nnina@e2e.test,Nina New");
  await expect(ta.getByRole("cell", { name: /Nina New/ })).toBeVisible();

  await ta.goto(`/courses/${courseId}/manage/venues`);
  await ta.getByLabel("Name").fill("Lab 7");
  await ta.getByRole("button", { name: "Add venue" }).click();
  await expect(ta.getByText("Venue added.")).toBeVisible();

  const assignmentId = await createPublishedAssignment(ta, courseId, "Sprint demo");

  // The invite email lands in the outbox; the student sets a password from its link.
  const mail = await browser.newPage();
  await mail.goto("/dev/mail?to=nina@e2e.test");
  const inviteHref = await mail.getByRole("link", { name: /\/invite\// }).first().getAttribute("href");
  const student = await (await browser.newContext()).newPage();
  student.on("dialog", (d) => d.accept());
  await student.goto(new URL(inviteHref!).pathname);
  await student.getByLabel("New password").fill("nina-secret-1");
  await student.getByLabel("Confirm password").fill("nina-secret-1");
  await student.getByRole("button", { name: "Activate account" }).click();
  await expect(student).toHaveURL(/\/dashboard/);

  // Student books, then reschedules.
  await student.getByRole("link", { name: /SOLO101 Title/ }).click();
  await student.getByRole("link", { name: /Sprint demo/ }).click();
  await student.getByRole("button", { name: "Book" }).first().click();
  await expect(student.getByText("Your demo")).toBeVisible();
  await expect(student.getByText("09:00–09:15")).toBeVisible();
  await student.getByRole("link", { name: "Reschedule" }).click();
  await student.getByRole("button", { name: "Move here" }).first().click();
  await expect(student.getByText("Rescheduled.")).toBeVisible();
  await expect(student).not.toHaveURL(/reschedule=1/);
  await expect(student.getByText("09:15–09:30")).toBeVisible();
  await expect(student.getByText("1 of 2 reschedules left.")).toBeVisible();

  // TA marks attendance and scores the demo; with no instructor, submitting releases marks.
  await ta.goto(`/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`);
  await ta.getByRole("link", { name: "Mark", exact: true }).click();
  await ta.getByRole("button", { name: "Completed" }).click();
  await expect(ta.getByText("Completed", { exact: true })).toBeVisible();
  await ta.getByLabel("Functionality").fill("5");
  await ta.getByLabel("Code quality").fill("3.5");
  await expect(ta.getByLabel("Total marks")).toHaveValue("8.5");
  await ta.getByLabel("Feedback for the student").fill("Clear walkthrough");
  await ta.getByLabel("Private notes").fill("Needed hints on tests");
  await ta.getByRole("button", { name: "Submit & release marks" }).click();
  await expect(ta.getByText("Finalized").first()).toBeVisible();

  // Student sees marks + feedback, never the private notes.
  await student.reload();
  await expect(student.getByText("Your result")).toBeVisible();
  await expect(student.getByText("Clear walkthrough")).toBeVisible();
  await expect(student.getByText("Needed hints on tests")).toHaveCount(0);

  // Export has the full record.
  const res = await ta.request.get(`/courses/${courseId}/manage/assignments/${assignmentId}/export`);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("nina@e2e.test");
  expect(csv).toContain("completed");
  expect(csv).toContain("8.5");
  expect(csv).toContain("finalized");
});

test("with an instructor, TA submissions wait for review and the instructor finalizes", async ({ browser }) => {
  const prof = await login(browser, "prof@e2e.test");
  const courseId = await createCourse(prof, "REV200", "Instructor");
  await importRoster(prof, "email,role\nta@e2e.test,ta\nsam@e2e.test,student");
  const assignmentId = await createPublishedAssignment(prof, courseId, "Viva");

  const student = await login(browser, "sam@e2e.test");
  await student.goto(`/courses/${courseId}/assignments/${assignmentId}`);
  await student.getByRole("button", { name: "Book" }).first().click();
  await expect(student.getByText("Your demo")).toBeVisible();

  const ta = await login(browser, "ta@e2e.test");
  await ta.goto(`/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`);
  await ta.getByRole("link", { name: "Mark", exact: true }).click();
  await ta.getByLabel("Functionality").fill("6");
  await ta.getByLabel("Code quality").fill("4");
  await ta.getByRole("button", { name: "Submit for review" }).click();
  await expect(ta.getByText("Awaiting review").first()).toBeVisible();

  // Not released yet.
  await student.reload();
  await expect(student.getByText("Your result")).toHaveCount(0);

  await prof.goto(`/courses/${courseId}/manage/review`);
  await expect(prof.getByText("Sam Student")).toBeVisible();
  await prof.getByRole("button", { name: "Finalize" }).click();
  await expect(prof.getByText("Nothing to review")).toBeVisible();

  await student.reload();
  await expect(student.getByText("Your result")).toBeVisible();
  await expect(student.getByText("10 / 10")).toBeVisible();
});
