import { expect, test } from "@playwright/test";
import { createCourse, createPublishedAssignment, importRoster, login, open } from "./helpers";

test("a student answers the booking survey and sends feedback; only the platform account sees both, anonymously", async ({ browser }) => {
  test.setTimeout(300_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "FDBK200");
  await importRoster(ta, "email,role\nria@e2e.test,student");
  // Late-afternoon slots, so they don't clash with this TA's or Ria's other e2e demos.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Survey demo", { from: "16:00", to: "17:00" });

  // Booking succeeds, then the one-question survey appears once.
  const ria = await login(browser, "ria@e2e.test");
  await open(ria, `/courses/${courseId}/assignments/${assignmentId}`);
  await ria.getByRole("button", { name: "Book" }).first().click();
  await expect(ria.getByText("Your demo", { exact: true })).toBeVisible();
  const survey = ria.getByRole("complementary", { name: "How easy was it to book your demo?" });
  await expect(survey).toBeVisible();
  await survey.getByRole("button", { name: "4: Easy" }).click();
  await expect(ria.getByText("Thanks — that helps us improve Uniflow.")).toBeVisible();
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

  // The admin console has no insights or feedback, and /platform turns admins away.
  const signIn = async (email: string, landing: RegExp) => {
    const page = await (await browser.newContext()).newPage();
    await open(page, "/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(landing);
    return page;
  };
  const admin = await signIn("admin@e2e.test", /\/admin/);
  await expect(admin.getByRole("link", { name: "Insights" })).toHaveCount(0);
  await open(admin, "/platform/feedback");
  await expect(admin).not.toHaveURL(/\/platform/);

  // The platform account reads it with role, page and release, but no name.
  const platform = await signIn("platform@e2e.test", /\/platform\/insights/);
  await expect(platform.getByRole("button", { name: "Send feedback" })).toHaveCount(0);
  await open(platform, "/platform/feedback");
  const item = platform.getByRole("listitem").filter({ hasText: "Please show the room on the booking button." });
  await expect(item).toBeVisible();
  await expect(item).toContainText("student");
  await expect(item).toContainText("rated 4/5");
  await expect(item).not.toContainText("Ria");
  await item.getByRole("button", { name: "Mark triaged" }).click();
  await expect(platform.getByRole("link", { name: "Triaged (1)" })).toBeVisible();

  await open(platform, "/platform/insights?tab=surveys");
  await expect(platform.getByText(/Average 4\.0 of 5/)).toBeVisible();
  await open(platform, "/platform/insights?tab=workflow");
  await expect(platform.getByText("Bookings made")).toBeVisible();
});
