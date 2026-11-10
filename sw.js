// Cache tampilan aplikasi supaya Saku tetap terbuka tanpa internet.
const CACHE = "saku-v2";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/id3.js",
  "/config.js",
  // pustaka Supabase dari CDN di-cache terpisah (lihat LIB)
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL);
      try { await c.add(new Request(LIB, { mode: "no-cors" })); } catch (err) {}
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.url === LIB || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // Pustaka & font: versi tetap, jadi cukup cache-first
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // API Supabase langsung ke jaringan

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", copy)); return res; })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Stale-while-revalidate untuk file aplikasi
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
