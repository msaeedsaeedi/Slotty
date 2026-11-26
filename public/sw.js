/* Uniflow service worker: each account's key pages kept for offline use + push notifications.
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
 *   with Uniflow closed, through POST /api/marking/drafts (#163; see "Marking drafts" below).
 *   This is the only thing the worker ever POSTs, and only drafts: never a submit or release.
 */
// The version names the caches; the marking-draft sync (#163) needs no new caches, so it stays v6.
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

function isRscRequest(request) {
  return request.headers.get("RSC") === "1" || new URL(request.url).searchParams.has("_rsc");
}

// ─── The account's list ──────────────────────────────────────────────────────

/** { owner, pages: [{url, version, key}], syncedAt } or null. Kept in memory too. */
let list = null;
let listLoaded = false;

async function readList() {
  if (listLoaded) return list;
  try {
    const res = await caches.match(LIST_KEY, { cacheName: PAGE_CACHE });
    list = res ? await res.json() : null;
  } catch {
    list = null;
  }
  listLoaded = true;
  return list;
}

async function writeList(next) {
  list = next;
  listLoaded = true;
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(LIST_KEY, new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } }));
}

async function forgetPages() {
  list = null;
  listLoaded = true;
  await caches.delete(PAGE_CACHE);
}

const listed = (l, pathname) => Boolean(l && l.pages.some((p) => p.url === pathname));

// ─── Saved pages ─────────────────────────────────────────────────────────────

/** Clients (tabs) whose current page came from a saved copy. Lost if the worker stops, which only hides the hint. */
const savedCopyClients = new Set();

const ASSET_RE = /\/_next\/static\/[^"'\s)\\<>]+/g;

/** Cache a build file a saved page needs, if it isn't already. */
async function keepAsset(cache, path) {
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
async function storePage(pathname, res, version) {
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

function expired(res) {
  const at = Date.parse(res.headers.get("X-Uniflow-Saved-At") || "");
  return !at || Date.now() - at > EXPIRY_DAYS * DAY;
}

/** The saved copy of a page, unless it has expired (then it's deleted). */
async function savedPage(pathname) {
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
async function savedPaths() {
  const cache = await caches.open(PAGE_CACHE);
  return (await cache.keys()).map((r) => new URL(r.url).pathname).filter((p) => p !== LIST_KEY);
}

/** Drop the oldest build files beyond STATIC_MAX, never the pinned ones or those a saved page needs. */
async function trimStatic(cache) {
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

let syncing = null;
/** A forced sync asked for while another was running: it runs once that one ends. */
let forcedNext = null;

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
function syncPages({ force = false } = {}) {
  if (syncing && force) {
    forcedNext ??= syncing.catch(() => {}).then(() => {
      forcedNext = null;
      return syncPages({ force: true });
    });
    return forcedNext;
  }
  if (syncing) return syncing;
  syncing = (async () => {
    const before = await readList();
    if (!force && before?.syncedAt && Date.now() - before.syncedAt < SYNC_EVERY_MS) return;
    let res;
    try {
      res = await fetch("/api/offline/pages", { credentials: "same-origin", cache: "no-store" });
    } catch {
      return; // offline: try again at the next trigger
    }
    if (!res.ok) return;
    const data = await res.json();
    if (before && before.owner !== data.owner) await forgetPages();
    const saveData = Boolean(self.navigator.connection && self.navigator.connection.saveData);
    const pages = saveData ? data.pages.filter((p) => p.key) : data.pages;
    await writeList({ owner: data.owner, pages, syncedAt: Date.now() });

    const cache = await caches.open(PAGE_CACHE);
    const wanted = new Map(pages.map((p) => [p.url, p]));
    const todo = [];
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path === LIST_KEY) continue;
      const res = await cache.match(req);
      if (!wanted.has(path) || !res || expired(res)) await cache.delete(req);
    }
    for (const p of pages) {
      const saved = await cache.match(p.url);
      if (!saved || saved.headers.get("X-Uniflow-Version") !== p.version) todo.push(p);
    }
    const next = async () => {
      for (let p = todo.shift(); p; p = todo.shift()) {
        try {
          const page = await fetch(p.url, { credentials: "same-origin", headers: { Accept: "text/html" }, priority: "low" });
          await storePage(p.url, page, p.version);
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, next));
    await trimStatic(await caches.open(STATIC_CACHE));
  })().finally(() => {
    syncing = null;
  });
  return syncing;
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
    (async () => {
      const l = await readList();
      const entry = l && l.pages.find((p) => p.url === url.pathname);
      const saved = await savedPage(url.pathname);
      if (!entry && !saved) {
        try {
          return await fetch(request);
        } catch {
          return caches.match(OFFLINE_URL);
        }
      }

      const network = fetch(request);
      // Whatever happens to this navigation, a good answer refreshes the saved copy.
      event.waitUntil(
        network
          .then((res) => (entry ? storePage(url.pathname, res.clone(), entry.version) : null))
          .catch(() => {}),
      );
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve("timeout"), NETWORK_TIMEOUT_MS);
      });
      const first = await Promise.race([network.catch(() => "failed"), timeout]);
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
      return caches.match(OFFLINE_URL);
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  // Pages ask the worker to forget saved pages (another account signed in, or the sign-in screen).
  if (type === "clear-pages") event.waitUntil(forgetPages());
  // Load this account's pages ahead of time (`force` after sign-in).
  if (type === "sync-pages") event.waitUntil(syncPages({ force: Boolean(event.data.force) }));
  // A page asks whether it was served from a saved copy (it labels itself).
  if (type === "saved-copy?" && event.source) {
    const savedCopy = savedCopyClients.has(event.source.id);
    savedCopyClients.delete(event.source.id);
    event.source.postMessage({ type: "uniflow:saved-copy", savedCopy });
  }
  // A page asks which paths are saved (links to pages not on the device show it offline).
  if (type === "saved-pages?" && event.source) {
    const source = event.source;
    event.waitUntil(savedPaths().then((paths) => source.postMessage({ type: "uniflow:saved-pages", paths })));
  }
});

// Fresh pages even when the app wasn't opened (installed Chrome apps only, when Chrome decides).
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "uniflow-pages") event.waitUntil(syncPages());
});

// ─── Marking drafts, uploaded with Uniflow closed (#163) ─────────────────────
// The page asks for a Background Sync (tag `marking-drafts`) when an upload can't reach
// Uniflow; Chrome fires it once there's a connection, with no Uniflow window open. This
// mirrors src/lib/draft-sync.ts (`syncAllDrafts`, `applyReply`): keep the two in step.
// - Same route and replies: saved → delete (unless edited meanwhile), conflict → keep with
//   the server's marks, refused → Needs attention, signed out / another account → wait,
//   network or server error → reject, so Chrome tries again later.
// - Sealed drafts (another account signed in since) are never uploaded; the server also
//   checks the account key against the signed-in account.
// - Drafts of a marking sheet open in some tab are left to that sheet (Web Lock).

const DRAFT_DB = "uniflow-drafts";
const DRAFT_STORE = "drafts";

function draftDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DRAFT_DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(DRAFT_STORE, { keyPath: "key" });
        store.createIndex("assignment", ["owner", "assignmentId"]);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function allDrafts() {
  const db = await draftDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = db.transaction(DRAFT_STORE).objectStore(DRAFT_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result || []);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

/** Read-modify-write one entry in one transaction; fn returns the new entry, null (delete) or undefined (leave). */
async function updateDraftEntry(key, fn) {
  const db = await draftDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(DRAFT_STORE, "readwrite", { durability: "strict" });
      const store = tx.objectStore(DRAFT_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const next = fn(req.result || null);
        if (next === null) store.delete(key);
        else if (next) store.put(next);
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

const retryDelay = (attempts) => Math.min(5000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);

async function uploadDraftEntry(entry) {
  let res;
  try {
    res = await fetch("/api/marking/drafts", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: entry.owner, assignmentId: entry.assignmentId, studentId: entry.studentId, baseVersion: entry.version, changeId: entry.changeId, draft: entry.payload }),
    });
  } catch {
    return { result: "network" };
  }
  const body = await res.json().catch(() => null);
  if (res.ok && body && body.result === "saved") return body;
  if (res.status === 409 && body && body.result === "conflict") return body;
  if (res.status === 401) return { result: "signed-out" };
  if (res.status === 403 && body && body.result === "other-account") return { result: "other-account" };
  if ([400, 413, 422].includes(res.status) && body && body.result === "refused") return body;
  return { result: "network" };
}

async function applyDraftReply(entry, reply) {
  await updateDraftEntry(entry.key, (now) => {
    if (!now) return undefined;
    const edited = now.changeId !== entry.changeId;
    if (reply.result === "saved") return edited ? { ...now, version: reply.version, state: "waiting", attempts: 0, nextTry: undefined } : null;
    if (reply.result === "conflict") return { ...now, state: "conflict", server: { ...reply.server, version: reply.version }, message: undefined };
    if (reply.result === "refused") return edited ? undefined : { ...now, state: "error", message: reply.message };
    if (reply.result === "network") {
      const attempts = (now.attempts || 0) + 1;
      return { ...now, attempts, nextTry: Date.now() + retryDelay(attempts) };
    }
    return undefined;
  });
}

function tellPages(event) {
  try {
    const ch = new BroadcastChannel("uniflow-drafts");
    ch.postMessage(event);
    ch.close();
  } catch {}
}

const lockFor = (name, fn) => (self.navigator.locks ? self.navigator.locks.request(name, fn) : fn());

/** Upload every waiting draft not owned by an open sheet. Rejects if any couldn't reach Uniflow. */
async function syncDrafts() {
  let openSheets = new Set();
  try {
    const held = (await self.navigator.locks?.query())?.held || [];
    openSheets = new Set(held.map((l) => l.name));
  } catch {}
  let unreachable = false;
  for (const entry of await allDrafts()) {
    if (!entry.payload || !entry.version || !entry.changeId || entry.sealedAt) continue;
    if ((entry.state || "waiting") !== "waiting") continue;
    if (openSheets.has(`uniflow-sheet:${entry.owner}:${entry.assignmentId}`)) continue;
    const reply = await lockFor(`uniflow-draft:${entry.key}`, async () => {
      tellPages({ type: "syncing", key: entry.key, on: true });
      const r = await uploadDraftEntry(entry);
      await applyDraftReply(entry, r);
      tellPages({ type: "syncing", key: entry.key, on: false });
      return r;
    });
    if (reply.result === "network") {
      unreachable = true;
      break;
    }
    if (reply.result === "signed-out" || reply.result === "other-account") break;
  }
  tellPages({ type: "changed" });
  // The installed app's icon shows how many marks are still on this device.
  const left = (await allDrafts()).filter((d) => !d.sealedAt).length;
  try {
    if (left) await self.navigator.setAppBadge?.(left);
    else await self.navigator.clearAppBadge?.();
  } catch {}
  if (unreachable) throw new Error("Uniflow unreachable: try again later");
}

self.addEventListener("sync", (event) => {
  if (event.tag === "marking-drafts") event.waitUntil(syncDrafts());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Uniflow", body: event.data.text() };
  }
  const link = data.url || "/notifications";
  const path = new URL(link, self.location.origin).pathname;
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
        const entry = l && l.pages.find((p) => p.url === path);
        if (!entry) return null;
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
