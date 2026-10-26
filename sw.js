const CACHE = "conacrew-v185";
const SHELL = [
  "./index.html",
  "./app.html",
  "./styles.css",
  "./store.js",
  "./app.js",
  "./seed.json",
  "./logo.png",
  "./logo-mark.png",
  "./icon-192-w.png",
  "./icon-512-w.png",
  "./apple-touch-icon-w.png",
  "./favicon.png",
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

// Notifications from the office, even when the app is closed.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "Conacrew", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Conacrew", {
    body: d.body || "",
    icon: "./icon-192-w.png",
    badge: "./favicon.png",
    tag: d.tag || "conacrew",
    renotify: true,
    vibrate: [220, 120, 220, 120, 220],
    data: { url: d.url || "#home" },
  }));
});
// Tapping a notification opens the app on the right page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || "#home";
  const target = new URL("./app.html" + (hash.startsWith("#") ? hash : "#" + hash), self.location.href).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes("/app.html"));
    if (open) { open.navigate(target).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
