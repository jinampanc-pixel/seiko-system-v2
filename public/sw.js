const CACHE = "seiko-tailors-shell-v6";
const SHELL = ["/", "/manifest.webmanifest?v=5", "/app-icon.svg?v=6", "/favicon.svg?v=6", "/app-icon-192.png?v=6", "/app-icon-512.png?v=6", "/apple-touch-icon.png?v=6", "/favicon-32.png?v=6"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(hit => hit || caches.match("/"))));
});
