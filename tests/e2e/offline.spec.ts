import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { createCourse, createPublishedAssignment, importRoster, login, open } from "./helpers";

/** Wait until the service worker controls the page (it claims clients on activate). */
async function controlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
}

/** Time from navigation start until `text` is visible, in ms (or the error message). */
async function timeTo(page: Page, url: string, text: RegExp | string): Promise<number | string> {
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "commit", timeout: 60_000 });
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 60_000 });
    return Date.now() - t0;
  } catch (e) {
    return `failed after ${Date.now() - t0} ms: ${(e as Error).message.split("\n")[0]}`;
  }
}

/** A page load: the browser's own navigation, or the service worker's fetch on its behalf. */
const isPageLoad = (r: Request) => r.method() === "GET" && (r.resourceType() === "document" || (r.serviceWorker() != null && !new URL(r.url()).pathname.startsWith("/_next/")));

/**
 * Make page loads of `path` slow, hang, or fail with a server error. Chromium routes the service
 * worker's own fetches too; DevTools throttling (CDP) doesn't reach the worker, so slowness is
 * simulated by holding the server's answer.
 */
async function network(context: BrowserContext, path: string, mode: { delayMs: number } | "hang" | "503") {
  let hits = 0;
  await context.route(`**${path}`, async (route) => {
    if (!isPageLoad(route.request()) || new URL(route.request().url()).pathname !== path) return route.fallback();
    hits++;
    if (mode === "503") return route.fulfill({ status: 503, contentType: "text/plain", body: "Service Unavailable" });
    await new Promise((r) => setTimeout(r, mode === "hang" ? 45_000 : mode.delayMs));
    if (mode === "hang") return route.abort("timedout").catch(() => {});
    return route.fallback().catch(() => {});
  });
  return { hits: () => hits, stop: () => context.unroute(`**${path}`) };
}

test("baseline: load and offline timings (recorded in docs ch. 10)", async ({ browser }) => {
  test.setTimeout(600_000);
  const page = await login(browser, "sam@e2e.test");
  const context = page.context();
  const m: Record<string, unknown> = {};

  m.coldDashboard = await timeTo(page, "/dashboard", /Sam/);
  await controlled(page);
  m.repeatDashboard = await timeTo(page, "/dashboard", /Sam/);
  m.cacheEntries = await page.evaluate(async () => Object.fromEntries(await Promise.all((await caches.keys()).map(async (k) => [k, (await (await caches.open(k)).keys()).length]))));

  await context.setOffline(true);
  m.offlineSaved = await timeTo(page, "/dashboard", /Sam/);
  m.offlineUnsaved = await timeTo(page, "/account", /You're offline/);
  await context.setOffline(false);

  // Lie-fi: connected, but the server never answers.
  let n = await network(context, "/dashboard", "hang");
  m.liefiSaved = await timeTo(page, "/dashboard", /Sam/);
  m.liefiRouteHits = n.hits();
  await n.stop();

  // Slow: the server answers after 8 s.
  n = await network(context, "/dashboard", { delayMs: 8000 });
  m.slowSaved = await timeTo(page, "/dashboard", /Sam/);
  await n.stop();

  // Server error on a saved page.
  await open(page, "/bookings");
  n = await network(context, "/bookings", "503");
  m.serverErrorSaved = await timeTo(page, "/bookings", /My demos/);
  m.serverErrorShowsCopy = !(await page.getByText("Service Unavailable").isVisible());
  await n.stop();

  // A submit whose connection drops (the browser still says online).
  await open(page, "/account");
  await context.route("**/account", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback()));
  await page.getByLabel("Name").fill("Sam Student");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await page.waitForTimeout(3000);
  m.droppedSubmit = (await page.getByText("Something went wrong on this page").isVisible()) ? "error page" : ((await page.getByRole("alert").first().textContent().catch(() => null)) ?? "nothing shown");
  await context.unroute("**/account");

  console.log("OFFLINE_BASELINE", JSON.stringify(m, null, 2));
  test.info().annotations.push({ type: "baseline", description: JSON.stringify(m) });
});

// ─── Agreed behaviour (ch. 4, PWA; ADR-038) ──────────────────────────────────

const pageCacheCount = (page: Page) =>
  page.evaluate(async () => {
    let n = 0;
    for (const k of await caches.keys()) if (/-pages-/.test(k)) n += (await (await caches.open(k)).keys()).length;
    return n;
  });

test("saved pages work offline and on a stalled or failing server, read-only and labelled", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await login(browser, "ria@e2e.test");
  const context = page.context();
  await open(page, "/dashboard");
  await controlled(page);
  await open(page, "/dashboard");
  await open(page, "/bookings");

  // Offline: the saved copy, labelled in the header; an unsaved page gets /offline.
  await context.setOffline(true);
  await page.goto("/dashboard");
  await expect(page.getByText(/Ria/).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);

  // Stalled server: the saved copy within about 5 s, labelled although the browser is online.
  const hang = await network(context, "/dashboard", "hang");
  const t0 = Date.now();
  await page.goto("/dashboard", { waitUntil: "commit" });
  await expect(page.getByText(/Ria/).first()).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(8000);
  await expect(page.getByRole("status").filter({ hasText: "Can't connect" })).toBeVisible();
  await hang.stop();
  // Once Uniflow answers again, the label goes and the page refreshes by itself.
  await expect(page.getByRole("status").filter({ hasText: "Can't connect" })).toHaveCount(0, { timeout: 20_000 });

  // A server error on a saved page shows the saved copy, not the error.
  const down = await network(context, "/bookings", "503");
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "My demos" })).toBeVisible();
  await expect(page.getByText("Service Unavailable")).toHaveCount(0);
  await down.stop();
});

test("a submit whose connection drops says so, keeps the input, and doesn't show the error page", async ({ browser }) => {
  const page = await login(browser, "ria@e2e.test");
  const context = page.context();
  await open(page, "/account");
  await context.route("**/account", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback()));
  await page.getByLabel("Name").fill("Ria Renamed");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText(/Couldn't reach Uniflow, so this may not have gone through/)).toBeVisible();
  await expect(page.getByText("Something went wrong on this page")).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveValue("Ria Renamed");
  await context.unroute("**/account");

  // Offline, submit buttons are disabled: nothing is queued.
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: "Save", exact: true }).first()).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "Save", exact: true }).first()).toBeEnabled();
});

test("saved pages and drafts don't outlive the account: sign-out, and another account signing in", async ({ browser }) => {
  test.setTimeout(300_000);
  // Sign-out wipes saved pages and IndexedDB.
  const sam = await login(browser, "sam@e2e.test");
  await open(sam, "/dashboard");
  await controlled(sam);
  await open(sam, "/bookings");
  expect(await pageCacheCount(sam)).toBeGreaterThan(0);
  await sam.evaluate(() => new Promise((r) => { const q = indexedDB.open("uniflow-drafts", 1); q.onupgradeneeded = () => q.result.createObjectStore("drafts", { keyPath: "key" }); q.onsuccess = () => { q.result.close(); r(null); }; }));
  await sam.getByRole("button", { name: "Sign out" }).click();
  await expect(sam).toHaveURL(/\/login/);
  expect(await pageCacheCount(sam)).toBe(0);
  expect(await sam.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain("uniflow-drafts");

  // Without signing out (the session just ends), the next person signs in through a reset link.
  const context = sam.context();
  await sam.goto("/login");
  await sam.getByLabel("Email").fill("sam@e2e.test");
  await sam.getByLabel("Password").fill("password123");
  await sam.getByRole("button", { name: "Sign in" }).click();
  await expect(sam).toHaveURL(/dashboard/);
  await open(sam, "/bookings");
  expect(await pageCacheCount(sam)).toBeGreaterThan(0);
  await context.clearCookies();

  await open(sam, "/forgot-password");
  await sam.getByLabel("Email").fill("ria@e2e.test");
  await sam.getByRole("button", { name: /Send/ }).click();
  await expect(sam.getByText(/If that email has an account/)).toBeVisible();
  const mail = await browser.newPage();
  await mail.goto("/dev/mail?to=ria@e2e.test");
  const resetHref = await mail.getByRole("link", { name: /\/reset-password\// }).first().getAttribute("href");
  await mail.close();
  await open(sam, new URL(resetHref!).pathname);
  await sam.getByLabel("New password").fill("password123");
  await sam.getByLabel("Confirm password").fill("password123");
  await sam.getByRole("button", { name: /password/i }).click();
  await expect(sam).toHaveURL(/dashboard/);
  // Sam's saved pages are gone; only Ria's own (if any) remain.
  await context.setOffline(true);
  await sam.goto("/bookings");
  await expect(sam.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});

test("marks typed offline survive a closed tab and save on reconnect, as a draft", async ({ browser }) => {
  test.setTimeout(400_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "OFF142");
  await importRoster(ta, "email,role\nsam@e2e.test,student");
  // Evening slots: other specs give this TA morning and afternoon ones.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Offline demo", { from: "18:00", to: "19:00" });
  const sam = await login(browser, "sam@e2e.test");
  await open(sam, `/courses/${courseId}/assignments/${assignmentId}`);
  await sam.getByRole("button", { name: "Book" }).first().click();
  await expect(sam.getByText("Your demo", { exact: true })).toBeVisible();

  await open(ta, `/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`);
  await ta.getByRole("link", { name: "Mark", exact: true }).click();
  await ta.getByLabel("Reason for marking before the demo").fill("Demoed early by arrangement");
  await ta.getByRole("button", { name: "Start marking" }).click();
  await ta.getByLabel("Functionality").fill("4");
  await expect(ta.getByText("Draft saved")).toBeVisible();
  const markUrl = new URL(ta.url()).pathname + new URL(ta.url()).search;
  const context = ta.context();

  // Offline: typing goes on, is kept on this device, and the tab is closed before it saves.
  await context.setOffline(true);
  await ta.getByLabel("Feedback for the student").fill("Typed offline");
  await expect(ta.getByText("Offline — kept on this device")).toBeVisible();
  const stored = () => ta.evaluate(() => new Promise<number>((r) => { const q = indexedDB.open("uniflow-drafts"); q.onsuccess = () => { try { const c = q.result.transaction("drafts").objectStore("drafts").count(); c.onsuccess = () => { r(c.result); q.result.close(); }; } catch { r(0); } }; q.onerror = () => r(0); }));
  await expect.poll(stored).toBe(1);
  await ta.close();

  // Back online, the sheet brings the marks back and saves them as a draft.
  await context.setOffline(false);
  const again = await context.newPage();
  await open(again, markUrl);
  await expect(again.getByLabel("Feedback for the student")).toHaveValue("Typed offline");
  await expect(again.getByText("Draft saved")).toBeVisible();
  await expect(again.getByText(/This device has unsaved marks/)).toHaveCount(0);
  await again.reload();
  await expect(again.getByLabel("Feedback for the student")).toHaveValue("Typed offline");
});

test("a push saves the page it links to, for offline use", async ({ browser }) => {
  const page = await login(browser, "ria@e2e.test");
  const context = page.context();
  await context.grantPermissions(["notifications"]);
  await open(page, "/dashboard");
  await controlled(page);
  const cdp = await context.newCDPSession(page);
  const registrations = new Set<string>();
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => e.registrations.forEach((r) => !r.isDeleted && registrations.add(r.registrationId)));
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => registrations.size).toBeGreaterThan(0);
  const saved = () => page.evaluate(async () => Boolean(await caches.match("/notifications")));
  expect(await saved()).toBe(false);
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: [...registrations][0],
    data: JSON.stringify({ title: "Reminder", body: "Your demo is in about an hour.", url: "/notifications" }),
  });
  await expect.poll(saved, { timeout: 15_000 }).toBe(true);
  await context.setOffline(true);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Offline|Can't connect/ })).toBeVisible();
  await context.setOffline(false);
});
