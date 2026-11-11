// Cache tampilan aplikasi supaya Saku tetap terbuka tanpa internet.
const CACHE = "saku-v7";
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

// Token Google terbaru (dikirim halaman, atau diperpanjang sendiri lewat /api/auth/token)
let swToken = null;
let swTokenExp = 0;
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "token") { swToken = e.data.token; swTokenExp = e.data.exp || 0; }
});
async function freshToken() {
  try {
    const r = await fetch("/api/auth/token", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    swToken = j.access_token;
    swTokenExp = Date.now() + (Number(j.expires_in || 3600) - 60) * 1000;
    return swToken;
  } catch (err) { return null; }
}
async function streamDrive(id, urlToken, range) {
  let tk = swToken && Date.now() < swTokenExp ? swToken : urlToken;
  const go = (t) => {
    const headers = { Authorization: "Bearer " + t };
    if (range) headers.Range = range;
    return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers });
  };
  let res = await go(tk);
  if (res.status === 401) {
    const t2 = await freshToken();
    if (t2) res = await go(t2);
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Streaming lagu dari Google Drive: tambahkan token login ke request supaya <audio> bisa memutar langsung
  if (url.origin === self.location.origin && url.pathname.startsWith("/__drive/")) {
    const id = decodeURIComponent(url.pathname.slice(9));
    e.respondWith(streamDrive(id, url.searchParams.get("t") || "", req.headers.get("range")));
    return;
  }
  if (url.pathname.startsWith("/api/")) return; // server login selalu ke jaringan

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
