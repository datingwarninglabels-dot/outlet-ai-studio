// Section 20 (PWA): "safe update behavior" + "useful offline support ...
// clear offline states; research, generation, and provider operations
// require internet." This app's pages are all dynamic, force-dynamic,
// session-specific server renders — there is no safe way to cache page
// HTML here (a cached copy could show stale or wrong-session content).
// So this service worker deliberately does two narrow things instead of
// a full offline app: cache-first for immutable static build assets, and
// a clearly-labeled static offline fallback page for navigations that
// fail with no network. See offline-banner.tsx for the live online/offline
// indicator and pwa-register.tsx for how updates are applied without
// yanking content out from under an open tab.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `outlet-ai-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// A new worker install()s and waits rather than taking over immediately —
// pwa-register.tsx shows an "Update available" banner and only sends this
// message (triggering skipWaiting) when the Owner explicitly clicks it, so
// an in-progress edit is never interrupted by a silent mid-session swap.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept non-GET requests — server actions and API mutations
  // must always reach the network; a cached response for those would be
  // actively wrong, not just stale.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
