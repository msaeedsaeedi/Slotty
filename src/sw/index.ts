/// <reference lib="webworker" />
/* Uniflow service worker: each account's key pages kept for offline use + push notifications.
 *
 * Written in TypeScript and bundled to public/sw.js by `bun run sw:build` (part of `build` and
 * `dev`; #188), so it shares code with the app instead of copying it. public/sw.js is a build
 * output: edit this file.
 *
 * Caching rules (see the system documentation, Business rules → PWA, ch. 7, and ADR-038;
 * agreed design: steps 1 and 2 on issue #160):
 * - Only GET requests are answered. Server Actions (POST) are never cached or replayed.
 * - Build assets (/_next/static) are cache-first, but only responses marked `immutable` are
 *   stored. The newest STATIC_MAX are kept, plus every file a saved page needs (pinned for as
 *   long as the page is saved), so a page saved before a release still renders.
 * - Which pages: the server's list for the signed-in account (/api/offline/pages, #162). A
 *   page is stored only if it is on that list AND its response carries `X-Uniflow-Offline:
 *   store` (set per address pattern in next.config.ts): two independent checks.
 * - Pages are loaded ahead of time (`syncPages`): on sign-in, when the app opens or comes back
 *   to the screen (at most every 5 minutes), when the connection returns, on a push (that
 *   page only) and on periodic background sync where Chrome allows it. Two at a time, low
 *   priority; only pages whose version changed; with data saver on, only the key pages.
 * - Pages are saved by path. An address with a query opens the saved page only if its query
 *   doesn't change the content (`savedPageKey`, src/lib/offline-urls.ts, #173): `?day=` and
 *   the like are other pages, which are never saved, so they never get a saved copy.
 * - Page navigations to a listed page are network-first. The saved copy is served when the
 *   network fails, takes longer than NETWORK_TIMEOUT_MS, or the server answers 5xx; the
 *   network answer still refreshes the copy. Pages served from a copy are told so
 *   (`saved-copy?`), so they label themselves even when the browser thinks it's online.
 * - Saved copies expire EXPIRY_DAYS after their last refresh, and leave when the page leaves
 *   the list (removed from a course, course ended). Everything else falls back to /offline.
 * - RSC data requests (soft navigations) are never cached; when they fail, Next.js falls
 *   back to a full navigation, which this worker can answer.
 * - Saved pages belong to one account: the list carries an opaque owner key and a different
 *   owner wipes them; pages also ask the worker to forget them (`clear-pages`), and signing
 *   out wipes everything (Clear-Site-Data).
 * - Marking drafts kept on the device (IndexedDB) upload on Background Sync (`marking-drafts`),
 *   with Uniflow closed, through POST /api/marking/drafts (#163), with the same code as the
 *   page (src/lib/draft-sync.ts). This is the only thing the worker ever POSTs, and only
 *   drafts: never a submit or release.
 */
import { DRAFT_SYNC_TAG, syncWaiting } from "@/lib/draft-sync";
import { savedPageKey } from "@/lib/offline-urls";

declare const self: ServiceWorkerGlobalScope;

/** Events the TypeScript DOM library doesn't describe yet (Background Sync, Periodic Background Sync). */
interface TaggedSyncEvent extends ExtendableEvent {
  readonly tag: string;
}
declare global {
  interface ServiceWorkerGlobalScopeEventMap {
    sync: TaggedSyncEvent;
    periodicsync: TaggedSyncEvent;
  }
  interface WorkerNavigator {
    readonly connection?: { saveData?: boolean };
  }
}

/** One page on the account's list (`offlinePages`, src/domain/offline-pages.ts). */
interface ListedPage {
  url: string;
  version: string;
  key?: boolean;
}
interface OfflineList {
  owner: string;
  pages: ListedPage[];
  syncedAt: number;
}

// The version names the caches; it changes only when what they hold changes.
const VERSION = "v6"; // v6: pages from the server's list, loaded ahead of time, pinned build files (#162)
const STATIC_CACHE = `uniflow-static-${VERSION}`;
const PAGE_CACHE = `uniflow-pages-${VERSION}`;
/** Caches this worker owns: its own and, from before the rename (#132), the `slotty-` ones. */
const OWN_CACHE = /^(uniflow|slotty)-/;
const OFFLINE_URL = "/offline";
/** The account's list and when it was last synced, kept next to the pages. */
const LIST_KEY = "/__uniflow/offline-list";
/** How long a saved page waits for the server before the saved copy is shown. */
const NETWORK_TIMEOUT_MS = 4000;
/** Build files kept besides the pinned ones: about two releases' worth. */
const STATIC_MAX = 400;
/** Install-time files that the cap never removes. */
const PINNED = ["/offline", "/brand/icon-192.png", "/brand/badge-96.png"];
/** Not more often than this unless asked to (sign-in). */
const SYNC_EVERY_MS = 5 * 60 * 1000;
/** Pages downloaded at once. */
const CONCURRENCY = 2;
const EXPIRY_DAYS = 14;
const DAY = 86_400_000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PINNED))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => OWN_CACHE.test(k) && k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isRscRequest(request: Request): boolean {
  return request.headers.get("RSC") === "1" || new URL(request.url).searchParams.has("_rsc");
}

// ─── The account's list ──────────────────────────────────────────────────────

/** Kept in memory too. */
let list: OfflineList | null = null;
let listLoaded = false;

async function readList(): Promise<OfflineList | null> {
  if (listLoaded) return list;
  try {
    const res = await caches.match(LIST_KEY, { cacheName: PAGE_CACHE });
    list = res ? ((await res.json()) as OfflineList) : null;
  } catch {
    list = null;
  }
  listLoaded = true;
  return list;
}

async function writeList(next: OfflineList): Promise<void> {
  list = next;
  listLoaded = true;
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(LIST_KEY, new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } }));
}

async function forgetPages(): Promise<void> {
  list = null;
  listLoaded = true;
  await caches.delete(PAGE_CACHE);
}

const listed = (l: OfflineList | null, pathname: string) => Boolean(l && l.pages.some((p) => p.url === pathname));

// ─── Saved pages ─────────────────────────────────────────────────────────────

/** Clients (tabs) whose current page came from a saved copy. Lost if the worker stops, which only hides the hint. */
const savedCopyClients = new Set<string>();

const ASSET_RE = /\/_next\/static\/[^"'\s)\\<>]+/g;

/** Cache a build file a saved page needs, if it isn't already. */
async function keepAsset(cache: Cache, path: string): Promise<void> {
  if (await cache.match(path)) return;
  try {
    const res = await fetch(path, { credentials: "same-origin" });
    if (res.ok && /\bimmutable\b/.test(res.headers.get("Cache-Control") || "")) await cache.put(path, res);
  } catch {}
}

/**
 * Store a page if both checks pass: it's on the account's list, and the server marked the
 * response storable. Only real pages: 200, not redirected (a sign-in redirect after the
 * session ended is never kept). The copy records when it was saved, its version, and the
 * build files it needs, which are cached too and pinned while it's saved.
 */
async function storePage(pathname: string, res: Response, version: string): Promise<boolean> {
  const l = await readList();
  if (!listed(l, pathname)) return false;
  if (res.status !== 200 || res.redirected || res.headers.get("X-Uniflow-Offline") !== "store") return false;
  const html = await res.text();
  const assets = [...new Set(html.match(ASSET_RE) || [])];
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(assets.map((a) => keepAsset(statics, a)));
  const headers = new Headers(res.headers);
  headers.set("X-Uniflow-Saved-At", new Date().toISOString());
  headers.set("X-Uniflow-Version", version || "");
  headers.set("X-Uniflow-Assets", assets.join(" "));
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(pathname, new Response(html, { status: 200, statusText: "OK", headers }));
  return true;
}

function expired(res: Response): boolean {
  const at = Date.parse(res.headers.get("X-Uniflow-Saved-At") || "");
  return !at || Date.now() - at > EXPIRY_DAYS * DAY;
}

/** The saved copy of a page, unless it has expired (then it's deleted). */
async function savedPage(pathname: string): Promise<Response | undefined> {
  const cache = await caches.open(PAGE_CACHE);
  const res = await cache.match(pathname);
  if (!res) return undefined;
  if (expired(res)) {
    await cache.delete(pathname);
    return undefined;
  }
  return res;
}

/** Saved page paths (for links that know what's on the device). */
async function savedPaths(): Promise<string[]> {
  const cache = await caches.open(PAGE_CACHE);
  return (await cache.keys()).map((r) => new URL(r.url).pathname).filter((p) => p !== LIST_KEY);
}

/** Drop the oldest build files beyond STATIC_MAX, never the pinned ones or those a saved page needs. */
async function trimStatic(cache: Cache): Promise<void> {
  const keep = new Set(PINNED);
  try {
    const pages = await caches.open(PAGE_CACHE);
    for (const req of await pages.keys()) {
      const res = await pages.match(req);
      for (const a of (res?.headers.get("X-Uniflow-Assets") || "").split(" ")) if (a) keep.add(a);
    }
  } catch {}
  const keys = (await cache.keys()).filter((r) => !keep.has(new URL(r.url).pathname));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_MAX)).map((r) => cache.delete(r)));
}

// ─── Loading pages ahead of time ─────────────────────────────────────────────

let syncing: Promise<void> | null = null;
/** A forced sync asked for while another was running: it runs once that one ends. */
let forcedNext: Promise<void> | null = null;

/**
 * Bring this device's saved pages in line with the account's list: wipe them if the owner
 * changed, delete pages no longer listed or expired, and download pages that are missing or
 * whose version changed, gently. A signed-out account (401) stops refreshing; its copies stay
 * until they expire, someone else signs in, or sign-out wipes them.
 *
 * One sync at a time. An ordinary request joins the running one; a forced one (sign-in)
 * runs again after it, because the running one may have fetched the list before the change
 * that prompted it.
 */
function syncPages({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (syncing && force) {
    forcedNext ??= syncing
      .catch(() => {})
      .then(() => {
        forcedNext = null;
        return syncPages({ force: true });
      });
    return forcedNext;
  }
  if (syncing) return syncing;
  syncing = (async () => {
    const before = await readList();
    if (!force && before?.syncedAt && Date.now() - before.syncedAt < SYNC_EVERY_MS) return;
    let res: Response;
    try {
      res = await fetch("/api/offline/pages", { credentials: "same-origin", cache: "no-store" });
    } catch {
      return; // offline: try again at the next trigger
    }
    if (!res.ok) return;
    const data = (await res.json()) as { owner: string; pages: ListedPage[] };
    if (before && before.owner !== data.owner) await forgetPages();
    const saveData = Boolean(self.navigator.connection?.saveData);
    const pages = saveData ? data.pages.filter((p) => p.key) : data.pages;
    await writeList({ owner: data.owner, pages, syncedAt: Date.now() });

    const cache = await caches.open(PAGE_CACHE);
    const wanted = new Map(pages.map((p) => [p.url, p]));
    const todo: ListedPage[] = [];
    let hadPages = 0;
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path === LIST_KEY) continue;
      hadPages++;
      const res = await cache.match(req);
      if (!wanted.has(path) || !res || expired(res)) await cache.delete(req);
    }
    for (const p of pages) {
      const saved = await cache.match(p.url);
      if (!saved || saved.headers.get("X-Uniflow-Version") !== p.version) todo.push(p);
    }
    // The first download for this account on this device (nothing of theirs saved yet): open
    // tabs show its progress, so nobody goes offline thinking the pages are there (#178). Later
    // syncs stay quiet.
    const firstTime = !before || before.owner !== data.owner || hadPages === 0;
    const progress = firstTime && todo.length > 0 ? { done: 0, total: todo.length } : null;
    if (progress) await tellProgress(progress, false);
    const next = async () => {
      for (let p = todo.shift(); p; p = todo.shift()) {
        try {
          const page = await fetch(p.url, { credentials: "same-origin", headers: { Accept: "text/html" }, priority: "low" } as RequestInit);
          await storePage(p.url, page, p.version);
        } catch {}
        if (progress) {
          progress.done++;
          await tellProgress(progress, false);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, next));
    if (progress) await tellProgress(progress, true);
    await trimStatic(await caches.open(STATIC_CACHE));
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Tell every open tab how the first download is going (`uniflow:pages-progress`, #178). */
async function tellProgress(p: { done: number; total: number }, finished: boolean): Promise<void> {
  try {
    for (const w of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      w.postMessage({ type: "uniflow:pages-progress", done: p.done, total: p.total, finished });
    }
  } catch {}
}

// ─── Requests ────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isRscRequest(request)) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok && /\bimmutable\b/.test(res.headers.get("Cache-Control") || "")) {
          event.waitUntil(cache.put(request, res.clone()).then(() => trimStatic(cache)));
        }
        return res;
      }),
    );
    return;
  }

  if (request.mode !== "navigate") return;
  event.respondWith(
    (async (): Promise<Response> => {
      const offlinePage = async () => (await caches.match(OFFLINE_URL)) ?? Response.error();
      // The saved page this address shows, if any: never another day's address for today's copy.
      const key = savedPageKey(url);
      const l = await readList();
      const entry = key === null ? undefined : l?.pages.find((p) => p.url === key);
      const saved = key === null ? undefined : await savedPage(key);
      if (!entry && !saved) {
        try {
          return await fetch(request);
        } catch {
          return offlinePage();
        }
      }

      const network = fetch(request);
      // Whatever happens to this navigation, a good answer refreshes the saved copy.
      event.waitUntil(
        network
          .then((res) => (entry && key ? storePage(key, res.clone(), entry.version) : null))
          .catch(() => {}),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), NETWORK_TIMEOUT_MS);
      });
      const first = await Promise.race([network.catch(() => "failed" as const), timeout]);
      clearTimeout(timer);
      if (first instanceof Response && first.status < 500) return first;
      // Slow, failed or a server error: the saved copy if there is one.
      if (saved) {
        if (event.resultingClientId) savedCopyClients.add(event.resultingClientId);
        return saved;
      }
      if (first instanceof Response) return first; // the server's own error page
      if (first === "timeout") {
        // Nothing saved: keep waiting for the server rather than give up early.
        try {
          return await network;
        } catch {}
      }
      return offlinePage();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  // Pages ask the worker to forget saved pages (another account signed in, or the sign-in screen).
  if (type === "clear-pages") event.waitUntil(forgetPages());
  // Load this account's pages ahead of time (`force` after sign-in).
  if (type === "sync-pages") event.waitUntil(syncPages({ force: Boolean(event.data.force) }));
  const source = event.source as Client | null;
  // A page asks whether it was served from a saved copy (it labels itself).
  if (type === "saved-copy?" && source) {
    const savedCopy = savedCopyClients.has(source.id);
    savedCopyClients.delete(source.id);
    source.postMessage({ type: "uniflow:saved-copy", savedCopy });
  }
  // A page asks which paths are saved (links to pages not on the device show it offline).
  if (type === "saved-pages?" && source) {
    event.waitUntil(savedPaths().then((paths) => source.postMessage({ type: "uniflow:saved-pages", paths })));
  }
});

// Fresh pages even when the app wasn't opened (installed Chrome apps only, when Chrome decides).
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "uniflow-pages") event.waitUntil(syncPages());
});

// ─── Marking drafts, uploaded with Uniflow closed (#163) ─────────────────────
// The page asks for a Background Sync (tag `marking-drafts`) when an upload can't reach
// Uniflow; Chrome fires it once there's a connection, with no Uniflow window open. The upload
// is the page's own code (`syncWaiting`, src/lib/draft-sync.ts): same route, same replies, one
// uploader per draft (Web Locks), drafts of a sheet open in some tab left to that sheet, sealed
// drafts never uploaded. If Uniflow couldn't be reached, the event fails so Chrome tries again.

async function syncDrafts(): Promise<void> {
  const { left, unreachable } = await syncWaiting({ force: true });
  // The installed app's icon shows how many marks are still on this device.
  try {
    if (left) await self.navigator.setAppBadge?.(left);
    else await self.navigator.clearAppBadge?.();
  } catch {}
  if (unreachable) throw new Error("Uniflow unreachable: try again later");
}

self.addEventListener("sync", (event) => {
  if (event.tag === DRAFT_SYNC_TAG) event.waitUntil(syncDrafts());
});

// ─── Push ────────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data: { title?: string; body?: string; url?: string; tag?: string };
  try {
    data = event.data.json();
  } catch {
    data = { title: "Uniflow", body: event.data.text() };
  }
  const link = data.url || "/notifications";
  const path = savedPageKey(new URL(link, self.location.origin));
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Uniflow", {
        body: data.body,
        icon: "/brand/icon-192.png",
        badge: "/brand/badge-96.png",
        tag: data.tag,
        data: { url: link },
      }),
      // Open tabs update their bell now instead of at the next check.
      self.clients.matchAll({ type: "window" }).then((windows) => windows.forEach((w) => w.postMessage({ type: "uniflow:push" }))),
      // Refresh the page the notification opens (e.g. the demo's room, link and TA before a
      // reminder), so it's current if the device is offline when the student taps it.
      readList().then((l) => {
        const entry = path === null ? undefined : l?.pages.find((p) => p.url === path);
        if (!entry || path === null) return null;
        return fetch(path, { credentials: "same-origin", headers: { Accept: "text/html" } })
          .then((res) => storePage(path, res, entry.version))
          .catch(() => {});
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
