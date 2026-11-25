/* Uniflow service worker: offline copies of key pages + push notifications.
 *
 * Caching rules (see the system documentation, Business rules → PWA, and ADR-038):
 * - Only GET requests. Server Actions (POST) are never cached or replayed.
 * - Build assets (/_next/static) are cache-first, but only responses marked
 *   `immutable` are stored, and only the newest STATIC_MAX of them are kept.
 *   `next dev` serves changing files at stable URLs with `no-cache`; caching
 *   those would serve stale CSS and JS.
 * - Page navigations to OFFLINE_PAGES are network-first. The last good copy is
 *   served when the network fails, takes longer than NETWORK_TIMEOUT_MS, or the
 *   server answers 5xx; the network answer still refreshes the copy when it
 *   arrives. Pages served from a copy are told so (`saved-copy?` message), so
 *   they show the saved-copy banner even when the browser thinks it's online.
 * - Everything else falls back to /offline.
 * - RSC data requests (soft navigations) are never cached; when they fail,
 *   Next.js falls back to a full navigation, which this worker can answer.
 * - Saved pages belong to whoever is signed in: pages ask the worker to forget
 *   them when another account signs in (`clear-pages`), and signing out wipes
 *   everything (Clear-Site-Data).
 */
const VERSION = "v5"; // v5: network timeout, 5xx fallback, saved-copy flag, static cap (#142); bump to replace cached copies
const STATIC_CACHE = `uniflow-static-${VERSION}`;
const PAGE_CACHE = `uniflow-pages-${VERSION}`;
/** Caches this worker owns: its own and, from before the rename (#132), the `slotty-` ones. */
const OWN_CACHE = /^(uniflow|slotty)-/;
const OFFLINE_URL = "/offline";
const OFFLINE_PAGES = [/^\/dashboard$/, /^\/bookings$/, /^\/notifications$/, /^\/courses\/[^/]+$/, /^\/courses\/[^/]+\/assignments\/[^/]+$/];
/** How long a saved page waits for the server before the saved copy is shown. */
const NETWORK_TIMEOUT_MS = 4000;
/** Build files kept: about two releases' worth, so the cache doesn't grow with every release. */
const STATIC_MAX = 400;
/** Install-time files that the cap never removes. */
const PINNED = ["/offline", "/brand/icon-192.png", "/brand/badge-96.png"];

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

/** Drop the oldest build files beyond STATIC_MAX (Cache API keys come back in insertion order). */
async function trimStatic(cache) {
  const keys = (await cache.keys()).filter((r) => !PINNED.includes(new URL(r.url).pathname));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_MAX)).map((r) => cache.delete(r)));
}

/** Clients (tabs) whose current page came from a saved copy. Lost if the worker stops, which only hides the hint. */
const savedCopyClients = new Set();

function savePage(pathname, res) {
  // Only keep real pages (not redirects to /login or errors).
  if (!res.ok || res.redirected) return Promise.resolve();
  const copy = res.clone();
  return caches.open(PAGE_CACHE).then((cache) => cache.put(pathname, copy));
}

async function savedPage(pathname) {
  return caches.match(pathname, { cacheName: PAGE_CACHE });
}

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
  const cacheable = OFFLINE_PAGES.some((re) => re.test(url.pathname));
  if (!cacheable) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const network = fetch(request);
  // Whatever happens to this navigation, a good answer refreshes the saved copy.
  event.waitUntil(network.then((res) => savePage(url.pathname, res)).catch(() => {}));
  event.respondWith(
    (async () => {
      const fromCopy = async () => {
        const saved = await savedPage(url.pathname);
        if (saved && event.resultingClientId) savedCopyClients.add(event.resultingClientId);
        return saved;
      };
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve("timeout"), NETWORK_TIMEOUT_MS);
      });
      const first = await Promise.race([network.catch(() => "failed"), timeout]);
      clearTimeout(timer);
      if (first instanceof Response && first.status < 500) return first;
      // Slow, failed or a server error: the saved copy if there is one.
      const saved = await fromCopy();
      if (saved) return saved;
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
  if (type === "clear-pages") event.waitUntil(caches.delete(PAGE_CACHE));
  // A page asks whether it was served from a saved copy (it shows the saved-copy banner).
  if (type === "saved-copy?" && event.source) {
    const savedCopy = savedCopyClients.has(event.source.id);
    savedCopyClients.delete(event.source.id);
    event.source.postMessage({ type: "uniflow:saved-copy", savedCopy });
  }
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
      // Save the page the notification opens (e.g. the demo's room, link and TA before a
      // reminder), so it's there if the device is offline when the student taps it.
      OFFLINE_PAGES.some((re) => re.test(path))
        ? fetch(path, { credentials: "same-origin", headers: { Accept: "text/html" } })
            .then((res) => savePage(path, res))
            .catch(() => {})
        : null,
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
