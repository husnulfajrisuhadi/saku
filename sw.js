// Cache tampilan aplikasi supaya Saku tetap terbuka tanpa internet.
const CACHE = "saku-v5";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/id3.js",
  "/config.js",
  "/drive.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL);
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

  // Streaming lagu dari Google Drive: tambahkan token login ke request supaya <audio> bisa memutar langsung
  if (url.origin === self.location.origin && url.pathname.startsWith("/__drive/")) {
    const id = decodeURIComponent(url.pathname.slice(9));
    const headers = { Authorization: "Bearer " + (url.searchParams.get("t") || "") };
    const range = req.headers.get("range");
    if (range) headers.Range = range;
    e.respondWith(fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers }));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // Font: versi tetap, jadi cukup cache-first
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // Google login & Drive API langsung ke jaringan

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", copy)); return res; })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // File aplikasi: ambil versi terbaru dulu, pakai cache hanya saat offline
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
