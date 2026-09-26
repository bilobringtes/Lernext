/* Next Level · Service Worker v2
   © 2026 Bülent Uslu · Konzeptvorschau
   Network-First-Strategie (optimal für Entwicklungsphasen)
*/
const CACHE = "nextlevel-v3";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(CORE).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Network-First Strategie: Erst Server fragen, bei Offline-Fehler auf Cache ausweichen
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && (req.url.startsWith(self.location.origin) || req.url.includes("fonts.g"))) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
