const CACHE = "conacrew-v62";
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./index.html", "./app.html", "./styles.css", "./logo-mark.png"])));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});
