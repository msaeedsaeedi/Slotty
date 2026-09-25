/* Slotty service worker: offline copies of a student's key pages + push notifications.
 *
 * Caching rules (see docs/business-rules.md → PWA):
 * - Only GET requests. Server Actions (POST) are never cached or replayed.
 * - Build assets (/_next/static) are immutable: cache-first.
 * - Page navigations to OFFLINE_PAGES are network-first; the last good copy is
 *   served when offline. Everything else falls back to /offline.
 * - RSC data requests (soft navigations) are never cached; when they fail,
 *   Next.js falls back to a full navigation, which this worker can answer.
 */
const VERSION = "v1";
const STATIC_CACHE = `slotty-static-${VERSION}`;
const PAGE_CACHE = `slotty-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const OFFLINE_PAGES = [/^\/dashboard$/, /^\/bookings$/, /^\/notifications$/, /^\/courses\/[^/]+$/, /^\/courses\/[^/]+\/assignments\/[^/]+$/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/192", "/icons/badge"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("slotty-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isRscRequest(request) {
  return request.headers.get("RSC") === "1" || new URL(request.url).searchParams.has("_rsc");
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
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    const cacheable = OFFLINE_PAGES.some((re) => re.test(url.pathname));
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only keep real pages (not redirects to /login or errors).
          if (cacheable && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (cacheable && (await caches.match(url.pathname, { cacheName: PAGE_CACHE }))) || caches.match(OFFLINE_URL)),
    );
  }
});

/** Pages can ask the worker to forget cached pages (e.g. on the sign-in screen). */
self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-pages") event.waitUntil(caches.delete(PAGE_CACHE));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Slotty", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Slotty", {
      body: data.body,
      icon: "/icons/192",
      badge: "/icons/badge",
      tag: data.tag,
      data: { url: data.url || "/notifications" },
    }),
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
