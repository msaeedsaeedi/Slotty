import { expect, test } from "@playwright/test";
import { login, open } from "./helpers";

test("a signed-out visitor reads the landing page and reaches sign-in", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo week, without the spreadsheet.");
  await expect(page.getByRole("banner")).toHaveCSS("position", "sticky");

  // "Invite only" opens to the support address.
  await page.getByText("Invite only").click();
  await expect(page.getByRole("link", { name: "support@uniflow.msaeedsaeedi.com" }).first()).toBeVisible();

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

test("the session cookie is __Host-, Secure and HttpOnly, older cookies still work, and signing out clears them (ADR-033, #133)", async ({ browser, baseURL }) => {
  const ta = await login(browser, "ta@e2e.test");
  const cookies = await ta.context().cookies();
  expect(cookies.find((c) => c.name === "__Host-uniflow_session")).toMatchObject({ secure: true, httpOnly: true, path: "/", sameSite: "Lax" });
  expect(cookies.some((c) => c.name.endsWith("slotty_session"))).toBe(false);
  await ta.context().close();
  // By domain and path, not url: Chromium refuses a Secure cookie set for an http:// URL.
  const domain = new URL(baseURL!).hostname;

  // A browser still holding a cookie under an earlier name (before the rename to Uniflow, or before
  // ADR-033) stays signed in; signing out ends that session and clears the cookie.
  for (const old of [{ name: "__Host-slotty_session", secure: true }, { name: "slotty_session", secure: false }]) {
    const fresh = await login(browser, "ta@e2e.test");
    const token = (await fresh.context().cookies()).find((c) => c.name === "__Host-uniflow_session")!.value;
    await fresh.context().close();

    const legacy = await browser.newContext();
    await legacy.addCookies([{ name: old.name, value: token, domain, path: "/", secure: old.secure }]);
    const page = await legacy.newPage();
    await open(page, "/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/(login)?$/);
    expect((await legacy.cookies()).some((c) => c.name.endsWith("_session"))).toBe(false);

    // The session itself is gone, not just the cookie.
    const replay = await browser.newContext();
    await replay.addCookies([{ name: "__Host-uniflow_session", value: token, domain, path: "/", secure: true }]);
    const again = await replay.newPage();
    await open(again, "/dashboard");
    await expect(again).toHaveURL(/\/login/);
    await Promise.all([legacy.close(), replay.close()]);
  }
});

test("the retired personal calendar feed answers 404 for any link (ADR-033)", async ({ request }) => {
  expect((await request.get("/calendar/0123456789abcdef.ics")).status()).toBe(404);
});

test("app icons are brand files, and the old generated icon addresses still reach them (#132)", async ({ request }) => {
  for (const [old, file] of [["192", "icon-192.png"], ["512", "icon-512.png"], ["maskable", "icon-maskable-512.png"], ["badge", "badge-96.png"]]) {
    const res = await request.get(`/icons/${old}`);
    expect(res.status()).toBe(200);
    expect(res.url()).toMatch(new RegExp(`/brand/${file}$`));
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Uniflow — demo booking", short_name: "Uniflow" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  const preview = await request.get("/opengraph-image");
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toBe("image/png");
});
