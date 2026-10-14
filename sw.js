const CACHE = "conacrew-v126";
const SHELL = [
  "./index.html",
  "./app.html",
  "./styles.css",
  "./store.js",
  "./app.js",
  "./seed.json",
  "./logo.png",
  "./logo-mark.png",
  "./manifest.webmanifest",
];

// Save the app files so it opens without signal.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

// Remove only older versions' caches, keep the current one.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "conacrew-media").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (always fresh when online); saved copy when offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/.netlify/functions/media") {
    // photos, voice notes and files never change: keep a copy so they open without signal
    event.respondWith(caches.open("conacrew-media").then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.pathname.startsWith("/.netlify/")) return; // live data is never cached
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("./app.html", { ignoreSearch: true });
          return Response.error();
        })
      )
  );
});
