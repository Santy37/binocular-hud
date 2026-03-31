/* ── LINK HUD Service Worker ─────────────────────────────────────── */
/* Caches app shell for offline use and handles background sync.     */

const CACHE_NAME = "link-hud-v1";

/** App shell files to pre-cache on install. */
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
];

/* ── Install: pre-cache app shell ────────────────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ──────────────────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: network-first for API, cache-first for assets ────────── */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Don't cache API calls — let the offline queue handle retries
  if (url.pathname.startsWith("/api")) return;

  // For BLE and navigation requests, go network-first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return resp;
      });
    })
  );
});

/* ── Push notifications ──────────────────────────────────────────── */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "LINK HUD";
  const body = data.body || "New update from your binoculars.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "link-hud",
    })
  );
});

/* ── Notification click → open app ───────────────────────────────── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
