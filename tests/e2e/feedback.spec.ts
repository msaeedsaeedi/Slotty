import { expect, test } from "@playwright/test";
import { createCourse, createPublishedAssignment, importRoster, login, open } from "./helpers";

test("a student answers the booking survey and sends feedback; an admin sees both, anonymously", async ({ browser }) => {
  test.setTimeout(300_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "FDBK200", "TA");
  await importRoster(ta, "email,role\nria@e2e.test,student");
  // Late-afternoon slots, so they don't clash with this TA's or Ria's other e2e demos.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Survey demo", { from: "16:00", to: "17:00" });

  // Booking succeeds, then the one-question survey appears once.
  const ria = await login(browser, "ria@e2e.test");
  await open(ria, `/courses/${courseId}/assignments/${assignmentId}`);
  await ria.getByRole("button", { name: "Book" }).first().click();
  await expect(ria.getByText("Your demo")).toBeVisible();
  const survey = ria.getByRole("complementary", { name: "How easy was it to book your demo?" });
  await expect(survey).toBeVisible();
  await survey.getByRole("button", { name: "4: Easy" }).click();
  await expect(ria.getByText("Thanks — that helps us improve Slotty.")).toBeVisible();
  await expect(survey).toBeHidden();

  // Feedback from the header.
  await ria.getByRole("button", { name: "Send feedback" }).click();
  const dialog = ria.getByRole("dialog", { name: "Send feedback" });
  await dialog.getByLabel("Your feedback").fill("Please show the room on the booking button.");
  await dialog.getByLabel("4").check();
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(ria.getByText("Thanks! Your feedback was sent anonymously.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // Usage data can be turned off in Account.
  await open(ria, "/account");
  await ria.getByLabel("Share usage data").uncheck();
  await ria.getByRole("button", { name: "Save" }).nth(2).click();
  await expect(ria.getByText(/Usage data is off/)).toBeVisible();

  // The admin reads it with role, page and release, but no name.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await open(admin, "/login");
  await admin.getByLabel("Email").fill("admin@e2e.test");
  await admin.getByLabel("Password").fill("password123");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await expect(admin).toHaveURL(/\/admin/);
  await open(admin, "/admin/feedback");
  const item = admin.getByRole("listitem").filter({ hasText: "Please show the room on the booking button." });
  await expect(item).toBeVisible();
  await expect(item).toContainText("student");
  await expect(item).toContainText("rated 4/5");
  await expect(item).not.toContainText("Ria");
  await item.getByRole("button", { name: "Mark triaged" }).click();
  await expect(admin.getByRole("link", { name: "Triaged (1)" })).toBeVisible();

  await open(admin, "/admin/insights?tab=surveys");
  await expect(admin.getByText(/Average 4\.0 of 5/)).toBeVisible();
  await open(admin, "/admin/insights?tab=workflow");
  await expect(admin.getByText("Bookings made")).toBeVisible();
});
