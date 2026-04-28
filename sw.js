// Minimal service worker. Network-first for same-origin requests so code
// updates always come through; falls back to the cache when offline. Pre-
// caches the app shell at install so the first offline visit works.
//
// Cross-origin requests (Firebase, gstatic CDN modules, Google sign-in) are
// passed straight through to the browser — never cached, never intercepted.

const CACHE_NAME = "shopping-shell-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg",
  "./css/styles.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/config.js",
  "./js/db.js",
  "./js/firebase.js",
  "./js/sections.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll fails atomically if any request fails; we don't want a single
    // missing file to break installation, so add individually.
    await Promise.all(SHELL.map((url) =>
      cache.add(url).catch((e) => console.warn("[SW] precache miss:", url, e))
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // bypass cross-origin

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Only cache successful, basic responses.
      if (fresh && fresh.ok && fresh.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      // For navigation requests, fall back to the cached app shell.
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
