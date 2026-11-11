(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.SAKU_CONFIG || {};
  const D = window.SakuDrive;
  const audio = $("audio");

  // ---------- Ikon ----------
  const ICON = {
    play: '<svg viewBox="0 0 24 24" class="fill"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" class="fill"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
    more: '<svg viewBox="0 0 24 24" class="fill"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5H7Z"/><path d="M12 11v6m-2.5-2.5L12 17l2.5-2.5"/></svg>',
    spin: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5H7Z"/><path d="M12 17v-6m-2.5 2.5L12 11l2.5 2.5"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M4 6h11M4 12h11M4 18h7M17 14v6m-3-3h6"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>'
  };

  // ---------- Util ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const bytes = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + " GB" : n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1e3) + " KB";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const EXT_MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", webm: "audio/webm", aif: "audio/aiff", aiff: "audio/aiff" };
  // Format yang tidak bisa diputar browser di iPhone, supaya bisa dilaporkan dengan jelas
  const UNSUPPORTED = { wma: "WMA", ape: "APE", wv: "WavPack", mid: "MIDI", midi: "MIDI", amr: "AMR", ra: "RealAudio", dsf: "DSD", dff: "DSD" };
  const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();
  function mimeFor(name, type) {
    const e = extOf(name);
    if (EXT_MIME[e]) return EXT_MIME[e];
    if (type && type.startsWith("audio/")) return type === "audio/mp3" ? "audio/mpeg" : type === "audio/x-m4a" ? "audio/mp4" : type;
    return "audio/mpeg";
  }
  const extForMime = (m) => ({ "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/flac": "flac", "audio/ogg": "ogg", "audio/webm": "webm", "audio/aiff": "aiff" }[m] || "mp3");
  const isAudioFile = (f) => (f.type && f.type.startsWith("audio/")) || !!EXT_MIME[extOf(f.name)];

  let toastTimer;
  function toast(msg, ms = 2400) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- Penyimpanan lokal (IndexedDB) ----------
  let dbPromise;
  function openDb() {
    return (dbPromise ||= new Promise((res, rej) => {
      const r = indexedDB.open("putar", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("tracks", { keyPath: "id" });
        d.createObjectStore("blobs");
        d.createObjectStore("covers");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  async function tx(store, mode, fn) {
    const d = await openDb();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      const req = fn(t.objectStore(store));
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error("abort"));
    });
  }
  const idb = {
    get: (s, k) => tx(s, "readonly", (st) => st.get(k)),
    all: (s) => tx(s, "readonly", (st) => st.getAll()),
    put: (s, v, k) => tx(s, "readwrite", (st) => (k === undefined ? st.put(v) : st.put(v, k))),
    del: (s, k) => tx(s, "readwrite", (st) => st.delete(k)),
    entries: async (s) => {
      const d = await openDb();
      return new Promise((res, rej) => {
        const out = [];
        const req = d.transaction(s, "readonly").objectStore(s).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
        req.onerror = () => rej(req.error);
      });
    }
  };
  async function putBlob(id, blob) {
    try {
      await idb.put("blobs", blob, id);
    } catch (e) {
      // Cadangan untuk Safari lama yang menolak Blob di IndexedDB
      const buf = await blob.arrayBuffer();
      await idb.put("blobs", { buf, type: blob.type }, id);
    }
  }
  async function getBlob(id) {
    const v = await idb.get("blobs", id);
    if (!v) return null;
    if (v instanceof Blob) return v;
    if (v.buf) return new Blob([v.buf], { type: v.type || "audio/mpeg" });
    return null;
  }

  // ---------- State ----------
  const LS_KEY = "putar:state";
  let prefs = { shuffle: false, repeat: "off", sort: "new", lastId: null, lastPos: 0 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch (e) {} };

  let tracks = [];
  const coverUrls = new Map();
  const busy = new Set(); // id yang sedang diunduh/diunggah
  let query = "";

  let baseQueue = [];
  let queue = [];
  let qIndex = -1;
  let current = null;
  let currentUrl = null;
  let prefetched = null; // { id, url }
  let artworkData = null;
  let seeking = false;

  const byId = (id) => tracks.find((t) => t.id === id);
  const playable = (t) => t && t.local;

  function sortedTracks() {
    const list = tracks.slice();
    if (prefs.sort === "az") list.sort((a, b) => a.title.localeCompare(b.title, "id", { sensitivity: "base" }));
    else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }
  function visibleTracks() {
    const q = query.trim().toLowerCase();
    const list = sortedTracks();
    if (!q) return list;
    return list.filter((t) => (t.title + " " + (t.artist || "") + " " + (t.album || "")).toLowerCase().includes(q));
  }

  // ---------- Sampul ----------
  function coverStyle(t) {
    const u = coverUrls.get(t.id);
    if (u) return `background-image:url('${u}')`;
    const h = hash(t.title + (t.artist || ""));
    const c1 = `hsl(${h % 360} 55% 42%)`;
    const c2 = `hsl(${(h + 60) % 360} 50% 22%)`;
    return `--c1:${c1};--c2:${c2}`;
  }
  const initial = (t) => esc((t.title || "?").trim().charAt(0).toUpperCase());
  function paintCover(el, t) {
    if (!t) { el.removeAttribute("style"); el.textContent = ""; return; }
    el.setAttribute("style", coverStyle(t));
    el.innerHTML = coverUrls.get(t.id) ? "" : initial(t);
  }
  async function loadCover(id) {
    const blob = await idb.get("covers", id).catch(() => null);
    if (blob instanceof Blob) coverUrls.set(id, URL.createObjectURL(blob));
  }

  // ---------- Render daftar ----------
  function render() {
    const list = visibleTracks();
    const total = tracks.length;
    const localCount = tracks.filter((t) => t.local).length;
    $("countLabel").textContent = query ? `${list.length}/${total} LAGU` : `${total} LAGU`;
    $("emptyState").hidden = total > 0;
    $("btnSort").textContent = prefs.sort === "az" ? "A-Z" : "BARU";
    $("btnShuffleAll").disabled = localCount === 0;

    const remoteOnly = tracks.filter((t) => !t.local && t.remote).length;
    $("cloudBanner").hidden = remoteOnly === 0;
    $("cloudBannerTitle").textContent = `${remoteOnly} LAGU BELUM DIUNDUH`;

    const playingId = current?.id;
    $("trackList").innerHTML = list.map((t, i) => {
      const cls = ["track"];
      if (t.id === playingId) cls.push("playing");
      if (!t.local) cls.push("remote");
      if (busy.has(t.id)) cls.push("busy");
      const no = t.id === playingId ? (audio.paused ? "||" : "&gt;") : String(i + 1).padStart(2, "0");
      const d = busy.has(t.id) ? "...." : t.duration ? fmt(t.duration) : "--:--";
      return `<li class="${cls.join(" ")}" data-id="${t.id}">
        <span class="no">${no}</span>
        <div class="info"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist || "Artis tidak diketahui")}</div></div>
        <span class="d">${d}</span>
        <button class="more" data-more="${t.id}" aria-label="Opsi">[:]</button>
      </li>`;
    }).join("");
    $("cloudDot").hidden = !session;
    $("stCloud").className = session ? "" : "st-off";
  }

  // ---------- Pemutar ----------
  function setPlayIcons() {
    const playing = !audio.paused;
    $("btnPlay").innerHTML = playing ? ICON.pause : ICON.play;
    $("led").classList.toggle("on", playing);
    $("viz").classList.toggle("paused", !playing);
    $("viz").classList.toggle("stopped", !current);
    $("tState").textContent = !current ? "STOP" : playing ? "PLAY" : "PAUSE";
    const row = current && document.querySelector(`.track[data-id="${current.id}"] .no`);
    if (row) row.innerHTML = playing ? "&gt;" : "||";
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = current ? (playing ? "playing" : "paused") : "none";
  }
  function setModeIcons() {
    $("btnShuffle").classList.toggle("on", prefs.shuffle);
    $("btnRepeat").classList.toggle("on", prefs.repeat !== "off");
    $("btnRepeatLabel").textContent = prefs.repeat === "one" ? "ULANG 1" : "ULANG";
    $("stShuf").className = prefs.shuffle ? "" : "st-off";
    $("stRep").className = prefs.repeat !== "off" ? "" : "st-off";
    $("stRep").textContent = prefs.repeat === "one" ? "ULANG1" : "ULANG";
  }

  // Pindah tampilan LCD: daftar lagu <-> sedang diputar
  let view = "lib";
  function setView(v) {
    view = v === "now" && current ? "now" : "lib";
    $("viewLib").hidden = view !== "lib";
    $("viewNow").hidden = view !== "now";
    $("stView").textContent = view === "now" ? "PUTAR" : "LAGU";
    $("btnViewLabel").textContent = view === "now" ? "DAFTAR" : "PEMUTAR";
    if (view === "now") fitMarquee();
  }
  function fitMarquee() {
    const span = $("nowTitle");
    const box = span.parentElement;
    span.classList.remove("scroll");
    span.textContent = span.dataset.text || "";
    if (span.scrollWidth > box.clientWidth) {
      span.textContent = (span.dataset.text || "") + "   *   " + (span.dataset.text || "") + "   *   ";
      span.style.setProperty("--dur", Math.max(6, (span.dataset.text || "").length * 0.35) + "s");
      span.classList.add("scroll");
    }
  }

  function buildQueue(startId, list) {
    baseQueue = list.filter(playable).map((t) => t.id);
    if (prefs.shuffle) {
      const rest = shuffleArr(baseQueue.filter((id) => id !== startId));
      queue = startId ? [startId, ...rest] : rest;
      qIndex = 0;
    } else {
      queue = baseQueue.slice();
      qIndex = Math.max(0, queue.indexOf(startId));
    }
  }

  async function blobUrlFor(id) {
    if (prefetched && prefetched.id === id) {
      const u = prefetched.url;
      prefetched = null;
      return u;
    }
    const blob = await getBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  }
  async function prefetchNext() {
    const nid = peekNext();
    if (!nid || (prefetched && prefetched.id === nid) || nid === current?.id) return;
    if (prefetched) URL.revokeObjectURL(prefetched.url);
    prefetched = null;
    const blob = await getBlob(nid);
    if (blob) prefetched = { id: nid, url: URL.createObjectURL(blob) };
  }
  function peekNext() {
    if (!queue.length) return null;
    if (qIndex + 1 < queue.length) return queue[qIndex + 1];
    return prefs.repeat === "all" ? queue[0] : null;
  }

  async function makeArtwork(id) {
    artworkData = null;
    const blob = await idb.get("covers", id).catch(() => null);
    if (!(blob instanceof Blob) || blob.size > 1.5e6) return;
    artworkData = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res({ src: r.result, type: blob.type || "image/jpeg" });
      r.onerror = () => res(null);
      r.readAsDataURL(blob);
    });
  }
  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !current) return;
    const artwork = artworkData
      ? [{ src: artworkData.src, sizes: "512x512", type: artworkData.type }]
      : [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist || "",
        album: current.album || "Saku",
        artwork
      });
    } catch (e) {}
  }
  function updatePositionState() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const d = audio.duration;
    if (!isFinite(d) || d <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, d) });
    } catch (e) {}
  }

  async function loadTrack(id, autoplay = true, startAt = 0) {
    const t = byId(id);
    if (!t) return;
    if (!t.local) {
      await downloadTrack(t);
      if (!t.local) return;
    }
    const url = await blobUrlFor(id);
    if (!url) { toast("File lagu tidak ditemukan di perangkat"); return; }
    const old = currentUrl;
    current = t;
    currentUrl = url;
    audio.src = url;
    if (startAt) {
      const seekOnce = () => { try { audio.currentTime = startAt; } catch (e) {} };
      audio.addEventListener("loadedmetadata", seekOnce, { once: true });
    }
    if (autoplay) {
      try { await audio.play(); } catch (e) { if (e.name !== "AbortError") console.warn(e); }
    }
    if (old) setTimeout(() => URL.revokeObjectURL(old), 4000);
    prefs.lastId = id;
    prefs.lastPos = startAt;
    savePrefs();
    showNowPlaying();
    makeArtwork(id).then(updateMediaSession);
    updateMediaSession();
    prefetchNext();
  }

  function showNowPlaying() {
    const t = current;
    const cover = $("nowCover");
    if (!t) {
      $("nowTitle").dataset.text = "TIDAK ADA LAGU";
      $("nowArtist").textContent = "-";
      $("nowAlbum").textContent = "";
      $("nowIndex").textContent = "000/000";
      cover.style.backgroundImage = "";
      cover.classList.remove("has-art");
      fitMarquee();
      setPlayIcons();
      render();
      return;
    }
    $("nowTitle").dataset.text = t.title;
    $("nowArtist").textContent = t.artist || "Artis tidak diketahui";
    $("nowAlbum").textContent = t.album || "";
    const pos = queue.indexOf(t.id) + 1;
    const pad = (n) => String(n).padStart(3, "0");
    $("nowIndex").textContent = `${pad(pos || 1)}/${pad(queue.length || 1)}`;
    $("nowFmt").textContent = `${extForMime(t.mime || "audio/mpeg").toUpperCase()} ${t.size ? "· " + bytes(t.size) : ""}`;
    const u = coverUrls.get(t.id);
    cover.style.backgroundImage = u ? `url('${u}')` : "";
    cover.classList.toggle("has-art", !!u);
    fitMarquee();
    setPlayIcons();
    render();
  }

  function playFromList(id) {
    const t = byId(id);
    if (!t) return;
    buildQueue(id, visibleTracks());
    if (!t.local) {
      return downloadTrack(t).then(() => {
        if (t.local) { buildQueue(id, visibleTracks()); return loadTrack(id, true); }
      });
    }
    return loadTrack(id, true);
  }

  function togglePlay() {
    if (!current) {
      const first = visibleTracks().find(playable);
      if (first) playFromList(first.id);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function next(auto = false) {
    if (!queue.length) return;
    if (auto && prefs.repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    let i = qIndex + 1;
    if (i >= queue.length) {
      if (prefs.repeat === "all") {
        if (prefs.shuffle) { queue = shuffleArr(baseQueue.slice()); }
        i = 0;
      } else if (auto) {
        audio.pause();
        audio.currentTime = 0;
        setPlayIcons();
        return;
      } else {
        i = 0;
        qIndex = i;
        loadTrack(queue[i], false);
        return;
      }
    }
    qIndex = i;
    loadTrack(queue[i], true);
  }
  function prev() {
    if (!queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; updatePositionState(); return; }
    let i = qIndex - 1;
    if (i < 0) i = prefs.repeat === "all" ? queue.length - 1 : 0;
    qIndex = i;
    loadTrack(queue[i], true);
  }
  function skip(sec) {
    if (!current) return;
    const d = isFinite(audio.duration) ? audio.duration : 0;
    audio.currentTime = Math.max(0, Math.min(d ? d - 0.25 : Infinity, audio.currentTime + sec));
    updatePositionState();
  }
  function toggleShuffle() {
    prefs.shuffle = !prefs.shuffle;
    savePrefs();
    setModeIcons();
    if (current) {
      if (prefs.shuffle) {
        queue = [current.id, ...shuffleArr(baseQueue.filter((id) => id !== current.id))];
        qIndex = 0;
      } else {
        queue = baseQueue.slice();
        qIndex = Math.max(0, queue.indexOf(current.id));
      }
      if (prefetched) { URL.revokeObjectURL(prefetched.url); prefetched = null; }
      prefetchNext();
      showNowPlaying();
    }
    toast(prefs.shuffle ? "Acak aktif" : "Acak mati", 1200);
  }
  function cycleRepeat() {
    prefs.repeat = prefs.repeat === "off" ? "all" : prefs.repeat === "all" ? "one" : "off";
    savePrefs();
    setModeIcons();
    prefetchNext();
    toast({ off: "Ulangi mati", all: "Ulangi semua", one: "Ulangi satu lagu" }[prefs.repeat], 1200);
  }

  // Event audio
  audio.addEventListener("play", setPlayIcons);
  audio.addEventListener("pause", () => { setPlayIcons(); updatePositionState(); savePos(); });
  audio.addEventListener("playing", updatePositionState);
  audio.addEventListener("loadedmetadata", () => {
    $("tDur").textContent = fmt(audio.duration);
    updatePositionState();
    if (current && isFinite(audio.duration) && !current.duration) {
      current.duration = audio.duration;
      idb.put("tracks", current).catch(() => {});
    }
  });
  audio.addEventListener("seeked", updatePositionState);
  audio.addEventListener("ratechange", updatePositionState);
  audio.addEventListener("ended", () => next(true));
  audio.addEventListener("error", () => {
    if (!current || !audio.src) return;
    toast("Lagu ini tidak bisa diputar, lanjut ke berikutnya");
    setTimeout(() => next(true), 600);
  });
  let lastSave = 0;
  audio.addEventListener("timeupdate", () => {
    const d = audio.duration, c = audio.currentTime;
    const p = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
    if (!seeking) {
      $("seek").value = Math.round(p * 10);
      $("seek").style.setProperty("--p", p + "%");
      $("tCur").textContent = fmt(c);
    }
    const now = Date.now();
    if (now - lastSave > 5000) { lastSave = now; savePos(); }
  });
  function savePos() {
    if (!current) return;
    prefs.lastId = current.id;
    prefs.lastPos = audio.currentTime || 0;
    savePrefs();
  }
  window.addEventListener("pagehide", savePos);
  document.addEventListener("visibilitychange", () => { if (document.hidden) savePos(); });

  // Kontrol lock screen. Sengaja tanpa seekbackward/seekforward:
  // di iPhone, kalau keduanya dipasang, tombol next/previous di lock screen berubah jadi tombol lompat 10 detik.
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) {} };
    set("play", () => { audio.play().catch(() => {}); });
    set("pause", () => audio.pause());
    set("stop", () => audio.pause());
    set("previoustrack", () => prev());
    set("nexttrack", () => next(false));
    set("seekto", (d) => {
      if (d.fastSeek && "fastSeek" in audio) audio.fastSeek(d.seekTime);
      else audio.currentTime = d.seekTime;
      updatePositionState();
    });
  }

  // Seek slider
  const seekEl = $("seek");
  seekEl.addEventListener("input", () => {
    seeking = true;
    const p = seekEl.value / 10;
    seekEl.style.setProperty("--p", p + "%");
    const d = audio.duration;
    $("tCur").textContent = fmt(isFinite(d) ? (p / 100) * d : 0);
  });
  seekEl.addEventListener("change", () => {
    const d = audio.duration;
    if (isFinite(d)) audio.currentTime = (seekEl.value / 1000) * d;
    seeking = false;
    updatePositionState();
  });

  // ---------- Impor ----------
  function durationOf(file) {
    return new Promise((res) => {
      const a = new Audio();
      const url = URL.createObjectURL(file);
      let done = false;
      const fin = (v) => { if (done) return; done = true; URL.revokeObjectURL(url); res(v); };
      a.preload = "metadata";
      a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => fin(0);
      setTimeout(() => fin(0), 8000);
      a.src = url;
    });
  }
  function titleFromName(name) {
    const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim().replace(/^\d{1,4}\s*[-.)]\s*/, "");
    const m = base.match(/^(.+?)\s+-\s+(.+)$/);
    return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base };
  }

  // Lagu dianggap sama kalau ukuran file sama dan namanya sama (atau nama lama belum tercatat)
  function findDuplicate(f) {
    return tracks.find((t) => t.size === f.size && (!t.fileName || t.fileName === f.name));
  }

  async function importFiles(fileList) {
    const all = Array.from(fileList || []);
    if (!all.length) return;
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    const report = { picked: all.length, added: [], dupes: [], skipped: [], failed: [] };
    const base = Date.now();
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      const ext = extOf(f.name);
      if (UNSUPPORTED[ext]) { report.skipped.push({ name: f.name, why: `Format ${UNSUPPORTED[ext]} tidak didukung iPhone` }); continue; }
      if (!isAudioFile(f)) { report.skipped.push({ name: f.name, why: "Bukan file audio" }); continue; }
      if (findDuplicate(f)) { report.dupes.push(f.name); continue; }
      toast(`Menambahkan ${i + 1}/${all.length}…`, 0);
      try {
        const id = uuid();
        const [tags, dur] = await Promise.all([window.readID3(f), durationOf(f)]);
        const fromName = titleFromName(f.name);
        const meta = {
          id,
          title: tags.title || fromName.title || "Tanpa judul",
          artist: tags.artist || fromName.artist || "",
          album: tags.album || "",
          duration: dur || 0,
          size: f.size,
          fileName: f.name,
          mime: mimeFor(f.name, f.type),
          addedAt: base + i,
          local: true,
          remote: false,
          driveId: null
        };
        await putBlob(id, f);
        if (tags.cover) {
          await idb.put("covers", tags.cover, id);
          coverUrls.set(id, URL.createObjectURL(tags.cover));
        }
        await idb.put("tracks", meta);
        tracks.push(meta);
        report.added.push(f.name);
        if (!dur) report.failed.push({ name: f.name, why: "Masuk, tapi durasinya tidak terbaca. Mungkin tidak bisa diputar", kept: true });
        if (i % 3 === 0) render();
      } catch (e) {
        console.error(e);
        const full = e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""));
        report.failed.push({ name: f.name, why: full ? "Penyimpanan perangkat penuh" : "Gagal disimpan (" + (e.message || e.name || "error") + ")" });
      }
    }
    render();
    if (current) { baseQueue = sortedTracks().filter(playable).map((t) => t.id); }
    showImportReport(report);
  }

  function showImportReport(r) {
    const notIn = r.skipped.length + r.failed.filter((x) => !x.kept).length;
    if (!notIn && !r.dupes.length && !r.failed.length) { toast(`${r.added.length} lagu ditambahkan`); return; }
    toast("");
    $("toast").classList.remove("show");
    const li = (name, why) => `<li><span class="rn">${esc(name)}</span><span class="rw">${esc(why)}</span></li>`;
    const problems = [...r.skipped.map((x) => li(x.name, x.why)), ...r.failed.map((x) => li(x.name, x.why))];
    openSheet(`<h3>Laporan impor</h3>
      <div class="stat">Dipilih: <b>${r.picked} file</b><br>Ditambahkan: <b>${r.added.length}</b><br>Sudah ada (dilewati): <b>${r.dupes.length}</b><br>Tidak masuk: <b>${notIn}</b></div>
      ${problems.length ? `<p class="sub">File yang bermasalah:</p><ul class="report">${problems.join("")}</ul>` : ""}
      <p class="tip">Jumlah "Dipilih" lebih sedikit dari isi folder? Berarti jendela pilih file menyembunyikan format yang tidak dikenali. Ubah filter jenis file ke "All files" lalu pilih ulang semuanya. Lagu yang sudah ada akan dilewati otomatis.</p>
      <button class="btn solid" style="width:100%;margin-top:12px" data-r="ok">OK</button>`);
    $("sheetBody").onclick = (e) => { if (e.target.closest("[data-r]")) closeSheet(); };
  }
  $("fileInput").addEventListener("change", (e) => { importFiles(e.target.files); e.target.value = ""; });

  // ---------- Cloud (Google Drive) ----------
  let session = D && D.user ? D.user : null; // pengguna Google yang sedang masuk
  let syncing = false;
  if (D) D.onChange((u) => { session = u; render(); });

  // Jalankan aksi cloud dari tap pengguna; minta login ulang kalau token habis
  function cloudAction(fn) {
    if (!D || !D.configured()) { toast("Login Google belum diaktifkan"); return; }
    D.withToken().then(fn).catch((e) => toast(e.message || "Gagal masuk Google"));
  }
  const fileNameFor = (t) => t.fileName || `${(t.artist ? t.artist + " - " : "") + t.title}.${extForMime(t.mime || "audio/mpeg")}`;

  async function sync({ quiet = false } = {}) {
    if (!D || !session || syncing || !navigator.onLine) return;
    if (!D.hasToken()) { if (!quiet) toast("Tekan SINKRON untuk masuk ulang ke Google"); return; }
    syncing = true;
    if (!quiet) toast("Menyinkronkan dengan Google Drive…", 0);
    try {
      const files = await D.list();
      const seen = new Set();
      for (const f of files) {
        const p = f.appProperties || {};
        let t = tracks.find((x) => x.driveId === f.id) || (p.sid && byId(p.sid));
        if (!t) {
          const fromName = titleFromName(f.name || "");
          t = {
            id: p.sid || "d_" + f.id,
            title: p.t || fromName.title || "Tanpa judul",
            artist: p.a || fromName.artist || "",
            album: p.al || "",
            duration: Number(p.d) || 0,
            size: Number(f.size) || 0,
            fileName: f.name,
            mime: f.mimeType || "audio/mpeg",
            addedAt: Date.parse(f.createdTime) || Date.now(),
            local: false, remote: true, driveId: f.id,
            fromPicker: !p.t
          };
          tracks.push(t);
          await idb.put("tracks", t);
        } else if (!t.remote || t.driveId !== f.id) {
          t.remote = true;
          t.driveId = f.id;
          await idb.put("tracks", t);
        }
        seen.add(t.id);
      }
      for (const t of tracks.slice()) {
        if (t.remote && !seen.has(t.id)) {
          t.remote = false;
          t.driveId = null;
          if (!t.local) await removeLocalMeta(t);
          else await idb.put("tracks", t);
        }
      }
      if (!quiet) toast(`Sinkron selesai: ${files.length} lagu di Drive`);
    } catch (e) {
      console.error(e);
      if (!quiet) toast("Sinkron gagal: " + (e.message || e));
    } finally {
      syncing = false;
      render();
    }
  }

  async function uploadTrack(t) {
    if (!session || busy.has(t.id)) return false;
    const blob = await getBlob(t.id);
    if (!blob) return false;
    busy.add(t.id); render();
    try {
      t.driveId = await D.upload(t, blob, fileNameFor(t));
      t.remote = true;
      await idb.put("tracks", t);
      return true;
    } catch (e) {
      console.error(e);
      toast(`Gagal mengunggah ${t.title}: ${e.message || e}`);
      if (/penuh|sesi/i.test(e.message || "")) throw e;
      return false;
    } finally {
      busy.delete(t.id); render();
    }
  }
  async function uploadPending() {
    const pending = tracks.filter((t) => t.local && !t.remote);
    let ok = 0;
    try {
      for (let i = 0; i < pending.length; i++) {
        toast(`Mengunggah ke Drive ${i + 1}/${pending.length}…`, 0);
        if (await uploadTrack(pending[i])) ok++;
      }
    } catch (e) { return; }
    if (pending.length) toast(`${ok} lagu tersimpan di Google Drive`);
  }

  async function downloadTrack(t) {
    if (t.local || busy.has(t.id)) return;
    if (!session) { toast("Masuk Google dulu untuk mengunduh"); openAccount(); return; }
    if (!navigator.onLine) { toast("Tidak ada internet"); return; }
    busy.add(t.id); render();
    try {
      const data = await D.download(t.driveId);
      const blob = data.type && data.type.startsWith("audio/") ? data : new Blob([data], { type: t.mime || "audio/mpeg" });
      await putBlob(t.id, blob);
      const tags = await window.readID3(blob);
      if (tags.cover) {
        await idb.put("covers", tags.cover, t.id);
        coverUrls.set(t.id, URL.createObjectURL(tags.cover));
      }
      if (t.fromPicker) {
        if (tags.title) t.title = tags.title;
        if (tags.artist) t.artist = tags.artist;
        if (tags.album) t.album = tags.album;
        delete t.fromPicker;
      }
      if (!t.duration) t.duration = await durationOf(blob);
      t.local = true;
      await idb.put("tracks", t);
    } catch (e) {
      console.error(e);
      toast(`Gagal mengunduh ${t.title}: ${e.message || e}`);
    } finally {
      busy.delete(t.id); render();
    }
  }
  async function downloadAll() {
    const list = tracks.filter((t) => !t.local && t.remote);
    if (!list.length) return;
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    for (let i = 0; i < list.length; i++) {
      toast(`Mengunduh ${i + 1}/${list.length}…`, 0);
      await downloadTrack(list[i]);
    }
    toast("Semua lagu siap diputar offline");
    if (current) baseQueue = sortedTracks().filter(playable).map((t) => t.id);
  }

  // Ambil lagu yang sudah ada di Google Drive (lewat pemilih file Google)
  async function importFromDrive() {
    let docs;
    try {
      docs = await D.pick();
    } catch (e) {
      toast(e.message || "Gagal membuka Google Drive");
      return;
    }
    if (!docs.length) return;
    let added = 0, dupes = 0;
    for (const doc of docs) {
      if (tracks.find((t) => t.driveId === doc.id)) { dupes++; continue; }
      const fromName = titleFromName(doc.name || "");
      const t = {
        id: "d_" + doc.id,
        title: fromName.title || "Tanpa judul",
        artist: fromName.artist || "",
        album: "",
        duration: 0,
        size: Number(doc.size) || 0,
        fileName: doc.name,
        mime: doc.mimeType || "audio/mpeg",
        addedAt: Date.now() + added,
        local: false, remote: true, driveId: doc.id,
        fromPicker: true
      };
      tracks.push(t);
      await idb.put("tracks", t);
      added++;
    }
    render();
    toast(`${added} lagu dipilih${dupes ? `, ${dupes} sudah ada` : ""}. Mengunduh…`);
    await downloadAll();
  }

  // ---------- Hapus ----------
  async function removeLocalMeta(t) {
    await idb.del("tracks", t.id).catch(() => {});
    await idb.del("covers", t.id).catch(() => {});
    const u = coverUrls.get(t.id);
    if (u) URL.revokeObjectURL(u);
    coverUrls.delete(t.id);
    tracks = tracks.filter((x) => x.id !== t.id);
  }
  function stopIfCurrent(t) {
    if (current && current.id === t.id) {
      const wasPlaying = !audio.paused;
      queue = queue.filter((id) => id !== t.id);
      baseQueue = baseQueue.filter((id) => id !== t.id);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      current = null;
      prefs.lastId = null;
      savePrefs();
      if (wasPlaying && queue.length) { qIndex = Math.min(qIndex, queue.length - 1); loadTrack(queue[qIndex], true); }
      else { showNowPlaying(); setView("lib"); }
    } else {
      queue = queue.filter((id) => id !== t.id);
      baseQueue = baseQueue.filter((id) => id !== t.id);
      if (current) qIndex = Math.max(0, queue.indexOf(current.id));
    }
  }
  async function deleteFromDevice(t) {
    stopIfCurrent(t);
    await idb.del("blobs", t.id).catch(() => {});
    if (t.remote) {
      t.local = false;
      await idb.put("tracks", t);
    } else {
      await removeLocalMeta(t);
    }
    render();
    toast("Dihapus dari perangkat");
  }
  async function deleteFromCloud(t, alsoLocal) {
    if (!session) { toast("Masuk Google dulu"); return; }
    busy.add(t.id); render();
    try {
      if (t.driveId) await D.remove(t.driveId);
      t.remote = false;
      t.driveId = null;
      if (alsoLocal || !t.local) {
        stopIfCurrent(t);
        await idb.del("blobs", t.id).catch(() => {});
        await removeLocalMeta(t);
      } else {
        await idb.put("tracks", t);
      }
      toast(alsoLocal ? "Dihapus dari semua tempat" : "Dihapus dari Google Drive");
    } catch (e) {
      console.error(e);
      toast("Gagal menghapus: " + (e.message || e));
    } finally {
      busy.delete(t.id); render();
    }
  }

  // ---------- Kosongkan library ----------
  function resetPlayer() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    current = null;
    queue = []; baseQueue = []; qIndex = -1;
    if (prefetched) { URL.revokeObjectURL(prefetched.url); prefetched = null; }
    prefs.lastId = null; prefs.lastPos = 0;
    savePrefs();
    showNowPlaying();
    setView("lib");
  }
  async function clearDevice() {
    resetPlayer();
    toast("Mengosongkan perangkat…", 0);
    await tx("blobs", "readwrite", (st) => st.clear()).catch(() => {});
    await tx("covers", "readwrite", (st) => st.clear()).catch(() => {});
    for (const u of coverUrls.values()) URL.revokeObjectURL(u);
    coverUrls.clear();
    const keep = [];
    for (const t of tracks) {
      if (t.remote) { t.local = false; keep.push(t); }
    }
    await tx("tracks", "readwrite", (st) => st.clear()).catch(() => {});
    for (const t of keep) await idb.put("tracks", t);
    tracks = keep;
    render();
    toast(keep.length ? `Perangkat kosong. ${keep.length} lagu masih ada di cloud` : "Semua lagu di perangkat sudah dihapus");
  }
  async function clearCloud() {
    if (!session) { toast("Masuk Google dulu"); return; }
    toast("Menghapus folder Saku di Google Drive…", 0);
    try {
      await D.removeAll();
      let n = 0;
      for (const t of tracks.slice()) {
        if (!t.remote) continue;
        n++;
        t.remote = false; t.driveId = null;
        if (!t.local) { if (current && current.id === t.id) resetPlayer(); await removeLocalMeta(t); }
        else await idb.put("tracks", t);
      }
      render();
      toast(`${n} lagu dihapus dari Google Drive`);
    } catch (e) {
      console.error(e);
      toast("Gagal menghapus: " + (e.message || e));
      render();
    }
  }
  function confirmBig(title, msg, label, fn) {
    openSheet(`<h3>${esc(title)}</h3><p class="sub">${esc(msg)}</p>
      <div class="row"><button class="btn" data-c="no">Batal</button><button class="btn solid" data-c="yes">${esc(label)}</button></div>`);
    $("sheetBody").onclick = (e) => {
      const b = e.target.closest("button[data-c]");
      if (!b) return;
      closeSheet();
      if (b.dataset.c === "yes") fn();
    };
  }

  // ---------- Menu utama ----------
  function openMainMenu() {
    const localN = tracks.filter((t) => t.local).length;
    const remoteN = tracks.filter((t) => t.remote).length;
    const items = [];
    if (current) items.push(`<li><button data-m="track">Opsi lagu ini</button></li>`);
    items.push(`<li><button data-m="add">Tambah dari perangkat / cek lagu yang belum masuk</button></li>`);
    if (session && D.pickerEnabled()) items.push(`<li><button data-m="pick">Ambil lagu dari Google Drive</button></li>`);
    items.push(`<li><button data-m="cloud">Google Drive & akun</button></li>`);
    if (localN) items.push(`<li><button data-m="clearlocal" class="danger">Kosongkan perangkat (${localN} lagu)</button></li>`);
    if (session && remoteN) items.push(`<li><button data-m="clearcloud" class="danger">Hapus semua di Google Drive (${remoteN} lagu)</button></li>`);
    openSheet(`<h3>Menu</h3><ul class="menu">${items.join("")}</ul>`);
    $("sheetBody").onclick = (e) => {
      const b = e.target.closest("button[data-m]");
      if (!b) return;
      const m = b.dataset.m;
      if (m === "track") openTrackMenu(current.id);
      else if (m === "add") { closeSheet(); $("fileInput").click(); }
      else if (m === "pick") { closeSheet(); importFromDrive(); }
      else if (m === "cloud") openAccount();
      else if (m === "clearlocal") confirmBig("Kosongkan perangkat?", remoteN
          ? `Semua file lagu di perangkat ini akan dihapus. Lagu yang sudah ada di cloud tetap aman dan bisa diunduh lagi. Lagu yang belum diunggah akan hilang.`
          : `Semua ${localN} lagu di perangkat ini akan dihapus permanen.`, "Kosongkan", clearDevice);
      else if (m === "clearcloud") confirmBig("Hapus semua di Google Drive?", `Folder "Saku" beserta ${remoteN} lagu di Google Drive kamu akan dihapus permanen. Lagu yang sudah ada di perangkat ini tetap bisa diputar.`, "Hapus semua", () => cloudAction(clearCloud));
    };
  }

  // ---------- Sheet ----------
  function openSheet(html) {
    $("sheetBody").innerHTML = html;
    $("sheetBackdrop").hidden = false;
    requestAnimationFrame(() => { $("sheet").classList.add("open"); $("sheet").setAttribute("aria-hidden", "false"); });
  }
  function closeSheet() {
    $("sheet").classList.remove("open");
    $("sheet").setAttribute("aria-hidden", "true");
    $("sheetBackdrop").hidden = true;
  }
  $("sheetBackdrop").addEventListener("click", closeSheet);

  function trackHeader(t) {
    return `<div class="sheet-track"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist || "Artis tidak diketahui")}${t.size ? " · " + bytes(t.size) : ""}${t.remote ? " · DRIVE" : ""}</div></div>`;
  }
  function openTrackMenu(id) {
    const t = byId(id);
    if (!t) return;
    const items = [];
    if (t.local) items.push(`<li><button data-act="playnext">Putar berikutnya</button></li>`);
    items.push(`<li><button data-act="rename">Ubah judul & artis</button></li>`);
    if (!t.local && t.remote) items.push(`<li><button data-act="download">Unduh untuk offline</button></li>`);
    if (t.local && !t.remote && session) items.push(`<li><button data-act="upload">Simpan ke Google Drive</button></li>`);
    if (t.local) items.push(`<li><button data-act="dellocal" class="${t.remote ? "" : "danger"}">${t.remote ? "Hapus dari perangkat (tetap di Drive)" : "Hapus lagu"}</button></li>`);
    if (t.remote) items.push(`<li><button data-act="delall" class="danger">Hapus dari semua tempat</button></li>`);
    openSheet(`${trackHeader(t)}<ul class="menu">${items.join("")}</ul>`);
    $("sheetBody").onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "playnext") {
        if (!current) { closeSheet(); playFromList(t.id); return; }
        queue = queue.filter((x) => x !== t.id);
        qIndex = queue.indexOf(current.id);
        queue.splice(qIndex + 1, 0, t.id);
        if (prefetched) { URL.revokeObjectURL(prefetched.url); prefetched = null; }
        prefetchNext();
        closeSheet();
        toast("Diputar setelah lagu ini");
      } else if (act === "rename") {
        openRename(t);
      } else if (act === "download") {
        closeSheet(); cloudAction(() => downloadTrack(t));
      } else if (act === "upload") {
        closeSheet(); cloudAction(() => uploadTrack(t).then((ok) => ok && toast("Tersimpan di Google Drive")).catch(() => {}));
      } else if (act === "dellocal") {
        confirmSheet(t, t.remote ? "Hapus file dari perangkat ini? Lagu masih bisa diunduh lagi dari Google Drive." : "Hapus lagu ini dari perangkat? Lagu belum tersimpan di Google Drive, jadi akan hilang permanen.", () => deleteFromDevice(t));
      } else if (act === "delall") {
        confirmSheet(t, "Hapus lagu ini dari Google Drive dan dari perangkat ini?", () => cloudAction(() => deleteFromCloud(t, true)));
      }
    };
  }
  function confirmSheet(t, msg, fn) {
    openSheet(`${trackHeader(t)}<p class="sub">${esc(msg)}</p>
      <div class="row"><button class="btn" data-c="no">Batal</button><button class="btn solid" data-c="yes">Hapus</button></div>`);
    $("sheetBody").onclick = (e) => {
      const b = e.target.closest("button[data-c]");
      if (!b) return;
      closeSheet();
      if (b.dataset.c === "yes") fn();
    };
  }
  function openRename(t) {
    openSheet(`<h3>Ubah info lagu</h3><p class="sub">Hanya mengubah nama yang tampil di aplikasi.</p>
      <form id="renameForm">
        <label class="field"><span>Judul</span><input name="title" value="${esc(t.title)}" required></label>
        <label class="field"><span>Artis</span><input name="artist" value="${esc(t.artist || "")}"></label>
        <div class="row"><button type="button" class="btn" id="rnCancel">Batal</button><button class="btn solid">Simpan</button></div>
      </form>`);
    $("sheetBody").onclick = null;
    $("rnCancel").onclick = closeSheet;
    $("renameForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      t.title = String(fd.get("title")).trim() || t.title;
      t.artist = String(fd.get("artist")).trim();
      await idb.put("tracks", t);
      if (t.remote && t.driveId && session && D.hasToken()) D.updateMeta(t.driveId, t).catch(() => {});
      closeSheet();
      if (current && current.id === t.id) { showNowPlaying(); updateMediaSession(); }
      render();
    };
  }

  async function openAccount() {
    const tip = `<p class="tip">Supaya lagu tetap jalan saat layar dikunci: mulai putar dulu, baru kunci layar. Kalau dari ikon Home Screen lagunya berhenti saat dikunci, buka lewat Safari biasa. Itu batasan iOS untuk web app.</p>`;
    let storageLine = "";
    try {
      const est = await navigator.storage?.estimate?.();
      if (est && est.quota) storageLine = `<div class="stat">Penyimpanan perangkat: <b>${bytes(est.usage || 0)}</b> terpakai dari ${bytes(est.quota)}</div>`;
    } catch (e) {}
    const localN = tracks.filter((t) => t.local).length;
    if (!D || !D.configured()) {
      openSheet(`<h3>Google Drive</h3><p class="sub">Login Google belum diaktifkan oleh pemilik app. Lagu tetap tersimpan offline di perangkat ini.</p>${storageLine}<div class="stat">Di perangkat: <b>${localN} lagu</b></div>${tip}`);
      $("sheetBody").onclick = null;
      return;
    }
    if (!session) {
      openSheet(`<h3>Google Drive</h3>
        <p class="sub">Masuk dengan akun Google untuk mencadangkan lagu ke folder <b>"Saku"</b> di Google Drive kamu sendiri, lalu unduh lagi di perangkat lain. Saku hanya bisa melihat file yang dibuatnya sendiri. File lain di Drive kamu tidak tersentuh.</p>
        <button class="btn solid gbtn" style="width:100%" data-a="login"><span class="g">G</span> Masuk dengan Google</button>
        <div class="err" id="loginErr"></div>
        ${storageLine}<div class="stat">Di perangkat: <b>${localN} lagu</b></div>
        ${tip}`);
      $("sheetBody").onclick = (e) => {
        const b = e.target.closest("button[data-a=login]");
        if (!b) return;
        D.requestToken(true).then(() => {
          closeSheet();
          toast(`Masuk sebagai ${session ? session.email : "akun Google"}`);
          D.ensureFolder().catch(() => {}).then(() => sync());
        }).catch((err) => { const el = $("loginErr"); if (el) el.textContent = err.message; });
      };
      return;
    }
    const remoteN = tracks.filter((t) => t.remote).length;
    const notDl = tracks.filter((t) => t.remote && !t.local).length;
    const notUp = tracks.filter((t) => t.local && !t.remote).length;
    openSheet(`<h3>Google Drive</h3>
      <p class="sub">Masuk sebagai ${esc(session.email)}</p>
      <div class="stat">Di Drive: <b>${remoteN} lagu</b> · Di perangkat: <b>${localN} lagu</b>${notDl ? `<br>${notDl} lagu belum diunduh` : ""}${notUp ? `<br>${notUp} lagu belum diunggah` : ""}</div>
      ${storageLine}
      <div class="row" style="margin-bottom:10px">
        <button class="btn solid" data-a="sync">Sinkron</button>
        ${notUp ? `<button class="btn" data-a="up">Unggah ${notUp}</button>` : ""}
        ${notDl ? `<button class="btn" data-a="dl">Unduh ${notDl}</button>` : ""}
      </div>
      ${D.pickerEnabled() ? `<button class="btn solid" style="width:100%;margin-bottom:10px" data-a="pick">+ Ambil lagu dari Drive</button>` : ""}
      <button class="btn" style="width:100%" data-a="logout">Keluar</button>
      <p class="tip">Taruh MP3 di folder "Saku" di Google Drive (misalnya dari laptop), lalu tekan AMBIL LAGU DARI DRIVE dan pilih semua. Lagu yang diunggah dari Saku tersimpan di folder yang sama.</p>
      ${tip}`);
    $("sheetBody").onclick = (e) => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      closeSheet();
      if (a === "sync") cloudAction(() => D.ensureFolder().catch(() => {}).then(() => sync()));
      else if (a === "dl") cloudAction(() => downloadAll());
      else if (a === "up") cloudAction(() => uploadPending());
      else if (a === "pick") importFromDrive();
      else if (a === "logout") { D.signOut(); toast("Keluar. Lagu di perangkat tetap ada."); }
    };
  }

  // ---------- Tampilan ----------
  const openPlayer = () => setView("now");
  const closePlayer = () => setView("lib");
  setInterval(() => { const d = new Date(); $("stClock").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }, 15000);
  { const d = new Date(); $("stClock").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  window.addEventListener("resize", () => view === "now" && fitMarquee());

  // ---------- Event UI ----------
  $("trackList").addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) { e.stopPropagation(); openTrackMenu(more.dataset.more); return; }
    const li = e.target.closest(".track");
    if (!li) return;
    const id = li.dataset.id;
    if (current && current.id === id) { openPlayer(); if (audio.paused) audio.play().catch(() => {}); return; }
    Promise.resolve(playFromList(id)).then(() => { if (current && current.id === id) openPlayer(); });
  });
  $("search").addEventListener("input", (e) => { query = e.target.value; render(); });
  $("btnSort").addEventListener("click", () => { prefs.sort = prefs.sort === "az" ? "new" : "az"; savePrefs(); render(); });
  $("btnShuffleAll").addEventListener("click", () => {
    const list = visibleTracks().filter(playable);
    if (!list.length) return;
    if (!prefs.shuffle) { prefs.shuffle = true; savePrefs(); setModeIcons(); }
    const start = list[Math.floor(Math.random() * list.length)].id;
    buildQueue(start, list);
    loadTrack(start, true);
  });
  $("btnDownloadAll").addEventListener("click", () => cloudAction(() => downloadAll()));
  $("btnEmptyDrive").addEventListener("click", () => {
    if (!D || !D.pickerEnabled()) { toast("Fitur Google Drive belum aktif"); return; }
    if (!session) { openAccount(); return; }
    importFromDrive();
  });
  $("btnAccount").addEventListener("click", openAccount);
  $("btnView").addEventListener("click", () => {
    if (view === "now") return setView("lib");
    if (!current) { toast("Belum ada lagu yang diputar"); return; }
    setView("now");
  });
  $("btnMenu").addEventListener("click", openMainMenu);
  $("btnPlay").addEventListener("click", togglePlay);
  $("btnNext").addEventListener("click", () => next(false));
  $("btnPrev").addEventListener("click", prev);
  $("btnShuffle").addEventListener("click", toggleShuffle);
  $("btnRepeat").addEventListener("click", cycleRepeat);
  $("btnBack10").addEventListener("click", () => skip(-10));
  $("btnFwd10").addEventListener("click", () => skip(10));
  // Getar halus di perangkat yang mendukung (Android); iPhone mengabaikannya
  document.querySelectorAll(".key").forEach((k) => k.addEventListener("pointerdown", () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }));
  window.addEventListener("online", () => sync({ quiet: true }));

  // Geser kiri/kanan di layar untuk pindah tampilan
  (() => {
    let x0 = null, y0 = null;
    const el = $("lcd");
    el.addEventListener("touchstart", (e) => {
      if (e.target.closest(".seek") || e.target.closest("input")) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && view === "lib" && current) setView("now");
      else if (dx > 0 && view === "now") setView("lib");
    }, { passive: true });
  })();

  // ---------- Mulai ----------
  async function init() {
    setModeIcons();
    showNowPlaying();
    setView("lib");
    try {
      tracks = (await idb.all("tracks")) || [];
      // Migrasi dari cloud lama (Supabase): tanda cloud lama tidak berlaku lagi
      for (const t of tracks.slice()) {
        if (t.remote && !t.driveId) {
          t.remote = false; t.storagePath = null;
          if (!t.local) { await idb.del("tracks", t.id); tracks = tracks.filter((x) => x !== t); }
          else await idb.put("tracks", t);
        }
      }
      const covers = await idb.entries("covers");
      for (const [k, v] of covers) if (v instanceof Blob) coverUrls.set(k, URL.createObjectURL(v));
    } catch (e) {
      console.error(e);
      toast("Penyimpanan browser tidak tersedia. Matikan mode Private di Safari.", 6000);
    }
    render();

    // Lanjutkan lagu terakhir (tanpa autoplay)
    const last = prefs.lastId && byId(prefs.lastId);
    if (last && last.local) {
      buildQueue(last.id, sortedTracks());
      await loadTrack(last.id, false, prefs.lastPos || 0);
      $("tCur").textContent = fmt(prefs.lastPos || 0);
    }

    if (session && D.hasToken()) D.ensureFolder().catch(() => {}).then(() => sync({ quiet: true }));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }
  init();
})();
