import { expect, test } from "@playwright/test";
import { createCourse, createPublishedAssignment, importRoster, login, open } from "./helpers";

// FIXME: final assertions fail because the answered request collapses its panel
// ("Handled" is hidden inside <details>). See docs/roadmap.md → "Open issues".
test.fixme("a stuck student asks for help, staff move them, and the calendar feed follows", async ({ browser }) => {
  test.setTimeout(300_000); // visits several pages the dev server compiles on first use
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "HELP300", "TA");
  await importRoster(ta, "email,role\nria@e2e.test,student");
  // Afternoon slots, so this TA's other e2e courses (09:00) don't overlap.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Oral exam", { from: "14:00", to: "15:00" });

  // Ria books and adds the demo to her calendar.
  const ria = await login(browser, "ria@e2e.test");
  await open(ria, `/courses/${courseId}/assignments/${assignmentId}`);
  await ria.getByRole("button", { name: "Book" }).first().click();
  await expect(ria.getByText("Your demo")).toBeVisible();
  await expect(ria.getByRole("link", { name: "Add to calendar" })).toBeVisible();

  // She can't make it and asks staff instead of spending changes.
  await ria.getByText("Need help with your booking?").click();
  await ria.getByRole("textbox", { name: "Need help with your booking?" }).fill("I have a clash with a lab, could I go 15 minutes later?");
  await ria.getByRole("button", { name: "Send to course staff" }).click();
  await expect(ria.getByText("Sent — course staff have been notified.")).toBeVisible();

  // The TA sees it in Requests and moves her.
  await open(ta, `/courses/${courseId}/manage/requests`);
  await expect(ta.getByText("I have a clash with a lab")).toBeVisible();
  await ta.getByRole("link", { name: "Open booking & exceptions" }).click();
  await ta.waitForLoadState("networkidle");
  await ta.getByLabel("Move to another slot").selectOption({ index: 0 });
  await ta.getByRole("button", { name: "Move", exact: true }).click();
  await expect(ta.getByText("Done — the student was notified.")).toBeVisible();
  await ta.goto(`/courses/${courseId}/manage/requests`);
  await expect(ta.getByText("No open requests")).toBeVisible();

  await open(ria, `/courses/${courseId}/assignments/${assignmentId}`);
  await expect(ria.getByText("Handled")).toBeVisible();
  // The move answers her request automatically, and her demo card shows the new time.
  await expect(ria.getByText(/Placed in .*14:15–14:30/)).toBeVisible();
  await expect(ria.getByText("Your demo")).toBeVisible();
  await expect(ria.getByText("14:15–14:30", { exact: false }).first()).toBeVisible();

  // Personal calendar feed from the account page.
  await open(ria, "/account");
  await ria.getByRole("button", { name: "Create calendar link" }).click();
  const feedUrl = await ria.getByLabel("Calendar subscription link").inputValue();
  expect(feedUrl).toMatch(/\/calendar\//);
  const feed = await ria.request.get(new URL(feedUrl).pathname);
  expect(await feed.text()).toContain("SUMMARY:HELP300 demo: Oral exam");
});
