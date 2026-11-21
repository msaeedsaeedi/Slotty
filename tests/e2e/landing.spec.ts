import { expect, test } from "@playwright/test";
import { login, open } from "./helpers";

test("a signed-out visitor reads the landing page and reaches sign-in", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo week, without the spreadsheet.");
  await expect(page.getByRole("banner")).toHaveCSS("position", "sticky");

  // "Invite only" opens to the support address.
  await page.getByText("Invite only").click();
  await expect(page.getByRole("link", { name: "support@slotty.msaeedsaeedi.com" }).first()).toBeVisible();

  // The five steps are a tablist: End selects the last step and shows its panel.
  await page.getByRole("tab", { name: /Import class/ }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Release marks/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: /Release marks/ })).toBeVisible();

  // Four questions up front, four more behind a disclosure.
  await expect(page.getByText("How do I get an account?")).toBeVisible();
  await page.getByText("More questions (4)").click();
  await expect(page.getByText("What timezone are the times in?")).toBeVisible();

  await expect(page.getByRole("link", { name: /More work at msaeedsaeedi\.com/ })).toHaveAttribute("href", "https://msaeedsaeedi.com");

  await page.locator("[data-own-cta]").getByRole("link", { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("No account yet?")).toBeVisible();
});

test("on a phone nothing scrolls sideways, and the Sign in bar steps aside for the final call to action", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await open(page, "/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const bar = page.locator(".lp-mobile-cta");
  await expect(bar).toHaveAttribute("data-visible", "false");
  await page.locator("#roles").scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("data-visible", "true");
  await page.locator("[data-own-cta]").scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("data-visible", "false");
  await context.close();
});

test("with reduced motion the page is static and shows the booked slot", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await open(page, "/");
  // The hero's booking shows its result at once (step 3 of How it works has a booked row too).
  await expect(page.locator(".lp-hero [data-mine=true]")).toHaveCount(1);
  await expect(page.locator(".lp-cursor")).toHaveCSS("opacity", "0");
  await expect(page.locator("[data-sealed=true]")).toHaveCount(0);
  await context.close();
});

test("without JavaScript every step and question is readable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("tablist")).toBeHidden();
  for (const step of ["Import class", "Publish slots", "Students book", "Mark on the day", "Release marks"]) {
    await expect(page.getByRole("tabpanel", { name: step })).toBeVisible();
  }
  await expect(page.getByText("How do I get an account?")).toBeVisible();
  await context.close();
});

test("a signed-in user opening / goes straight to their home", async ({ browser }) => {
  const ta = await login(browser, "ta@e2e.test");
  await open(ta, "/");
  await expect(ta).toHaveURL(/\/dashboard$/);
});

test("only the public pages are open to search engines", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /$");
  expect(robots).toContain("Allow: /privacy");
  expect(robots).toContain("Disallow: /");
});
