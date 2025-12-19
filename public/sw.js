/* sw.js – SUZI PWA Service Worker */

const CACHE_NAME = "suzi-cache-v2";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/suzi-profile.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // Do not cache API or auth fetches
  if (
    req.url.includes("/api/") ||
    req.url.includes("firebase") ||
    req.url.includes("googleapis") ||
    req.url.includes("onrender.com")
  ) {
    return;
  }

  // Navigation route → try network first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache First for assets
  event.respondWith(
    caches.match(req).then(cached => {
      return (
        cached ||
        fetch(req).then(res => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(req, res.clone());
            return res;
          });
        })
      );
    })
  );
});
