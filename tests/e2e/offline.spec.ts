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
  await open(page, "/notifications");

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
  // (/notifications: every account has it; /bookings is only a student's, #162.)
  const down = await network(context, "/notifications", "503");
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Service Unavailable")).toHaveCount(0);
  await down.stop();
});

test("a submit whose connection drops is Unconfirmed, keeps the input, and doesn't show the error page", async ({ browser }) => {
  const page = await login(browser, "ria@e2e.test");
  const context = page.context();
  await open(page, "/account");
  await context.route("**/account", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback()));
  await page.getByLabel("Name").fill("Ria Renamed");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  // Unconfirmed, not an error: the change may have happened (#161).
  const unconfirmed = page.locator('[data-state="unconfirmed"]');
  await expect(unconfirmed).toHaveText("Couldn't confirm — check before trying again");
  await expect(page.getByText("Something went wrong on this page")).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveValue("Ria Renamed");
  await context.unroute("**/account");

});

test("offline, a submit stays focusable, says why, and sends nothing", async ({ browser }) => {
  const page = await login(browser, "ria@e2e.test");
  const context = page.context();
  await open(page, "/account");
  let posts = 0;
  await context.route("**/account", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fallback();
  });
  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
  // aria-disabled, not disabled: focusable, with the reason in its name (#161).
  const save = page.getByRole("button", { name: /^Save\b.*needs a connection$/ }).first();
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await expect(save).toHaveAttribute("data-offline", "blocked");
  await save.focus();
  await expect(save).toBeFocused();
  // Playwright waits for aria-disabled controls to become enabled; a person can still tap it.
  await save.click({ force: true });
  await expect(page.getByText("Needs a connection", { exact: true })).toBeVisible();
  expect(posts).toBe(0);
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "Save", exact: true }).first()).not.toHaveAttribute("aria-disabled");
  await context.unroute("**/account");
});

test("a short drop doesn't flicker the offline state", async ({ browser }) => {
  const page = await login(browser, "ria@e2e.test");
  const context = page.context();
  await open(page, "/dashboard");
  // Record every connection state the page root goes through.
  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
    new MutationObserver(() => seen.push(document.documentElement.dataset.connection ?? "")).observe(document.documentElement, { attributes: true, attributeFilter: ["data-connection"] });
  });
  await context.setOffline(true);
  await page.waitForTimeout(1000);
  await context.setOffline(false);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).not.toContain("offline");
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toHaveCount(0);
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
  // Sam's saved pages are gone: offline, /bookings is Ria's own copy (pre-loaded for her, #162)
  // or the offline page, never Sam's.
  await context.setOffline(true);
  await sam.goto("/bookings");
  await expect(sam.getByRole("heading", { name: /My demos|You're offline/ })).toBeVisible();
  await expect(sam.getByText("Sam Student")).toHaveCount(0);
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
  await expect(ta.getByText("Saved", { exact: true })).toBeVisible();
  const markUrl = new URL(ta.url()).pathname + new URL(ta.url()).search;
  const context = ta.context();

  // Offline: typing goes on, is kept on this device, and the tab is closed before it saves.
  await context.setOffline(true);
  await ta.getByLabel("Feedback for the student").fill("Typed offline");
  await expect(ta.getByText("Saved on this device", { exact: true })).toBeVisible();
  // The header counts it and lists it with a link to the student's row (#161).
  await expect(ta.getByRole("status").filter({ hasText: "1 waiting" })).toBeVisible();
  const stored = () => ta.evaluate(() => new Promise<number>((r) => { const q = indexedDB.open("uniflow-drafts"); q.onsuccess = () => { try { const c = q.result.transaction("drafts").objectStore("drafts").count(); c.onsuccess = () => { r(c.result); q.result.close(); }; } catch { r(0); } }; q.onerror = () => r(0); }));
  await expect.poll(stored).toBe(1);
  await ta.close();

  // Back online, the sheet brings the marks back and saves them as a draft.
  await context.setOffline(false);
  const again = await context.newPage();
  await open(again, markUrl);
  await expect(again.getByLabel("Feedback for the student")).toHaveValue("Typed offline");
  await expect(again.getByText("Saved", { exact: true })).toBeVisible();
  await expect(again.getByText(/Changed elsewhere/)).toHaveCount(0);
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
  // Pre-loading (#162) already saved it at sign-in; drop it so the push is what brings it back.
  await expect.poll(saved).toBe(true);
  await page.evaluate(async () => {
    for (const k of await caches.keys()) await (await caches.open(k)).delete("/notifications");
  });
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

test("each account's pages are loaded ahead of time, work offline unopened, and leave when access ends", async ({ browser }) => {
  test.setTimeout(400_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "PRE162");
  await importRoster(ta, "email,role\nria@e2e.test,student");
  // Late slots: other specs give this TA morning, afternoon and evening ones.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Preload demo", { from: "20:00", to: "21:00" });
  const coursePage = `/courses/${courseId}`;
  const assignmentPage = `${coursePage}/assignments/${assignmentId}`;

  const ria = await login(browser, "ria@e2e.test");
  await open(ria, "/dashboard");
  await controlled(ria);
  const savedPaths = () =>
    ria.evaluate(async () => {
      const out: string[] = [];
      for (const k of await caches.keys()) if (/-pages-/.test(k)) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
  // The worker syncs at most every 5 minutes unless asked to (sign-in does); ask, as sign-in would.
  const sync = () => ria.evaluate(() => navigator.serviceWorker.controller?.postMessage({ type: "sync-pages", force: true }));
  await sync();
  await expect.poll(savedPaths, { timeout: 30_000 }).toEqual(expect.arrayContaining([coursePage, assignmentPage]));

  // Offline, the never-opened assignment page shows with its styles (its build files are on the
  // device), free slots say when they were updated, and links to pages not on the device say so.
  await ria.context().setOffline(true);
  await ria.goto(assignmentPage);
  await expect(ria.getByRole("heading", { name: "Preload demo" })).toBeVisible();
  expect(await ria.evaluate(() => [...document.styleSheets].reduce((n, s) => n + s.cssRules.length, 0))).toBeGreaterThan(0);
  await expect(ria.locator("[data-fresh]").first()).toContainText("updated");
  const account = ria.locator('a[href="/account"]').first();
  await expect(account).toHaveAttribute("data-offline", "unavailable");
  await expect(account).toHaveAttribute("aria-disabled", "true");
  await ria.context().setOffline(false);

  // Removed from the course: its pages leave the device at the next sync.
  await open(ta, `${coursePage}/manage/roster`);
  await ta.getByRole("row").filter({ hasText: "Ria Student" }).getByRole("button", { name: "Remove" }).click();
  await ta.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  // Wait for the server's answer first: while the dialog is open or closing, the page behind it
  // is aria-hidden, so a role query finds no row even though Ria hasn't been removed yet.
  await expect(ta.getByText("Removed from course", { exact: false })).toBeVisible();
  await expect(ta.getByRole("row").filter({ hasText: "Ria Student" })).toHaveCount(0);
  await sync();
  await expect.poll(async () => (await savedPaths()).some((p) => p.startsWith(coursePage)), { timeout: 30_000 }).toBe(false);
});

/** Marking drafts kept on this device (IndexedDB), read from any page of the site. */
const draftCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((r) => {
        const q = indexedDB.open("uniflow-drafts");
        q.onsuccess = () => {
          try {
            const c = q.result.transaction("drafts").objectStore("drafts").count();
            c.onsuccess = () => {
              r(c.result);
              q.result.close();
            };
          } catch {
            r(0);
          }
        };
        q.onerror = () => r(0);
      }),
  );

test("marks reach Uniflow by themselves: after a crash before the upload, and by Background Sync with Uniflow closed (#163)", async ({ browser }) => {
  test.setTimeout(400_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "SYNC163");
  await importRoster(ta, "email,role\nsam@e2e.test,student");
  // Late slots: other specs give this TA earlier ones.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Sync demo", { from: "21:00", to: "22:00" });
  const sam = await login(browser, "sam@e2e.test");
  await open(sam, `/courses/${courseId}/assignments/${assignmentId}`);
  await sam.getByRole("button", { name: "Book" }).first().click();
  await expect(sam.getByText("Your demo", { exact: true })).toBeVisible();

  await open(ta, `/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`);
  await ta.getByRole("link", { name: "Mark", exact: true }).click();
  await ta.getByLabel("Reason for marking before the demo").fill("Demoed early by arrangement");
  await ta.getByRole("button", { name: "Start marking" }).click();
  await ta.getByLabel("Functionality").fill("4");
  await expect(ta.getByText("Saved", { exact: true })).toBeVisible();
  await controlled(ta);
  const markUrl = new URL(ta.url()).pathname + new URL(ta.url()).search;
  const context = ta.context();

  // A crash after the marks reached the device, before the upload got through: the upload
  // never answers, and the tab dies without its unload handlers.
  await context.route("**/api/marking/drafts", () => {});
  await ta.getByLabel("Feedback for the student").fill("Before the crash");
  await expect.poll(() => draftCount(ta)).toBe(1);
  await ta.close({ runBeforeUnload: false });
  await context.unroute("**/api/marking/drafts");
  const back = await context.newPage();
  await open(back, markUrl);
  await expect(back.getByLabel("Feedback for the student")).toHaveValue("Before the crash");
  await expect(back.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => draftCount(back)).toBe(0);

  // Offline, typing is kept on this device; then every Uniflow tab closes.
  await context.setOffline(true);
  await back.getByLabel("Feedback for the student").fill("Synced in the background");
  await expect(back.getByText("Saved on this device", { exact: true })).toBeVisible();
  await expect.poll(() => draftCount(back)).toBe(1);
  await back.close();

  // Connection back, no Uniflow page open (/offline has no app shell, so nothing in a page
  // uploads): the browser's Background Sync runs the worker's upload.
  const shell = await context.newPage();
  await shell.goto("/offline");
  await context.setOffline(false);
  const cdp = await context.newCDPSession(shell);
  const registrations = new Set<string>();
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => e.registrations.forEach((r) => !r.isDeleted && registrations.add(r.registrationId)));
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => registrations.size).toBeGreaterThan(0);
  expect(await draftCount(shell)).toBe(1);
  await cdp.send("ServiceWorker.dispatchSyncEvent", { origin: new URL(shell.url()).origin, registrationId: [...registrations][0], tag: "marking-drafts", lastChance: false });
  await expect.poll(() => draftCount(shell), { timeout: 15_000 }).toBe(0);

  // The marks are on the server, as a draft: a fresh sheet shows them with nothing on the device.
  // (A new tab: navigating away from the worker's /offline page can abort in Chromium.)
  await cdp.detach();
  await shell.close();
  const fresh = await context.newPage();
  await open(fresh, markUrl);
  await expect(fresh.getByLabel("Feedback for the student")).toHaveValue("Synced in the background");
  await expect(fresh.getByText("Changed elsewhere")).toHaveCount(0);
});

test("offline, an address whose query changes the page is never served today's copy (#173)", async ({ browser }) => {
  test.setTimeout(300_000);
  const ta = await login(browser, "ta@e2e.test");
  // Staff of a course have Demo day on their list.
  await createCourse(ta, "Q173");
  await open(ta, "/dashboard");
  await controlled(ta);
  const savedPaths = () =>
    ta.evaluate(async () => {
      const out: string[] = [];
      for (const k of await caches.keys()) if (/-pages-/.test(k)) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
  await ta.evaluate(() => navigator.serviceWorker.controller?.postMessage({ type: "sync-pages", force: true }));
  await expect.poll(savedPaths, { timeout: 30_000 }).toContain("/today");

  const context = ta.context();
  await context.setOffline(true);
  await ta.goto("/today");
  await expect(ta.getByRole("heading", { name: "Demo day" })).toBeVisible();
  // Another day's link is a page that isn't on the device: it says so and doesn't navigate.
  const otherDay = ta.locator('main a[href*="day="]').first();
  await expect(otherDay).toHaveAttribute("data-offline", "unavailable");
  await otherDay.click({ force: true });
  await expect(ta.getByText("Not available offline").first()).toBeVisible();
  expect(new URL(ta.url()).search).toBe("");
  // Opened by address, it's the offline page, not today's copy under another day's address.
  await ta.goto("/today?day=2030-01-07");
  await expect(ta.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await ta.goto("/today?scope=everyone");
  await expect(ta.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});

test("offline, a notification opens the saved page it's about, not the offline page (#174)", async ({ browser }) => {
  test.setTimeout(400_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "N174");
  await importRoster(ta, "email,role\nria@e2e.test,student");
  // Late slots (the window can start today, so not in the morning); other specs use earlier ones.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Notified demo", { from: "22:00", to: "23:00" });
  const assignmentPage = `/courses/${courseId}/assignments/${assignmentId}`;

  // Opening booking sent Ria a "Book your demo" notification about the assignment page.
  const ria = await login(browser, "ria@e2e.test");
  await open(ria, "/dashboard");
  await controlled(ria);
  const savedPaths = () =>
    ria.evaluate(async () => {
      const out: string[] = [];
      for (const k of await caches.keys()) if (/-pages-/.test(k)) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
  await ria.evaluate(() => navigator.serviceWorker.controller?.postMessage({ type: "sync-pages", force: true }));
  await expect.poll(savedPaths, { timeout: 30_000 }).toEqual(expect.arrayContaining(["/notifications", assignmentPage]));

  // Online, the item goes through the route that marks it read.
  await open(ria, "/notifications");
  const item = ria.getByRole("link").filter({ hasText: "Book your demo: Notified demo" });
  await expect(item).toHaveAttribute("href", /^\/notifications\//);

  // Offline, it links straight to the saved page and opens it.
  const context = ria.context();
  await context.setOffline(true);
  await ria.goto("/notifications");
  await expect(item).toHaveAttribute("href", assignmentPage);
  await item.click();
  await expect(ria).toHaveURL(new RegExp(`${assignmentPage}$`));
  await expect(ria.getByRole("heading", { name: "Notified demo" })).toBeVisible();
  await expect(ria.getByRole("heading", { name: "You're offline" })).toHaveCount(0);
  await context.setOffline(false);
});

test("offline, a demo that hasn't started can be marked: the reason is accepted on the device and saves with the marks (#176)", async ({ browser }) => {
  test.setTimeout(400_000);
  const ta = await login(browser, "ta@e2e.test");
  const courseId = await createCourse(ta, "E176");
  await importRoster(ta, "email,role\nsam@e2e.test,student");
  // An hour no other spec gives this TA.
  const assignmentId = await createPublishedAssignment(ta, courseId, "Early demo", { from: "19:00", to: "20:00" });
  const sam = await login(browser, "sam@e2e.test");
  await open(sam, `/courses/${courseId}/assignments/${assignmentId}`);
  await sam.getByRole("button", { name: "Book" }).first().click();
  await expect(sam.getByText("Your demo", { exact: true })).toBeVisible();

  await open(ta, `/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`);
  await ta.getByRole("link", { name: "Mark", exact: true }).click();
  await expect(ta.getByLabel("Reason for marking before the demo")).toBeVisible();
  await controlled(ta);
  const markUrl = new URL(ta.url()).pathname + new URL(ta.url()).search;
  const context = ta.context();

  // Offline: the reason unlocks the row at once, and the marks are kept on this device.
  await context.setOffline(true);
  await ta.getByLabel("Reason for marking before the demo").fill("Demoed early, offline");
  await ta.getByRole("button", { name: "Start marking" }).click();
  await expect(ta.getByLabel("Reason for marking before the demo")).toHaveCount(0);
  await ta.getByLabel("Functionality").fill("4");
  await expect(ta.getByText("Saved on this device", { exact: true })).toBeVisible();
  await expect.poll(() => draftCount(ta)).toBe(1);

  // Typing on, offline, the label stays: it doesn't blink with each keystroke, and pauses don't
  // flash "Syncing" (#177). Sample the row's indicator every 25 ms while typing and after.
  await ta.evaluate(() => {
    const w = window as unknown as { __sync: string[] };
    w.__sync = [];
    setInterval(() => w.__sync.push(document.querySelector('section[aria-label^="Marking"] [data-sync]')?.getAttribute("data-sync") ?? "none"), 25);
  });
  await ta.getByLabel("Feedback for the student").pressSequentially("Typed slowly, offline", { delay: 60 });
  await ta.waitForTimeout(2000); // past the 800 ms autosave pause
  const seen = await ta.evaluate(() => (window as unknown as { __sync: string[] }).__sync);
  expect(seen.length).toBeGreaterThan(40);
  expect([...new Set(seen)]).toEqual(["saved-local"]);
  await ta.close();

  // Back online, the draft saves with the reason; the server has both.
  await context.setOffline(false);
  const again = await context.newPage();
  await open(again, markUrl);
  await expect(again.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => draftCount(again)).toBe(0);
  await again.reload();
  await expect(again.getByText("Marked before the demo: “Demoed early, offline”")).toBeVisible();
  await expect(again.getByLabel("Functionality")).toHaveValue("4");
  await expect(again.getByLabel("Feedback for the student")).toHaveValue("Typed slowly, offline");
});
