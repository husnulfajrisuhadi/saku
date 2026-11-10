(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.PUTAR_CONFIG;
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

  const EXT_MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", webm: "audio/webm" };
  const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();
  function mimeFor(name, type) {
    const e = extOf(name);
    if (EXT_MIME[e]) return EXT_MIME[e];
    if (type && type.startsWith("audio/")) return type === "audio/mp3" ? "audio/mpeg" : type === "audio/x-m4a" ? "audio/mp4" : type;
    return "audio/mpeg";
  }
  const extForMime = (m) => ({ "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/flac": "flac", "audio/ogg": "ogg", "audio/webm": "webm" }[m] || "mp3");
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
    $("countLabel").textContent = query ? `${list.length} dari ${total} lagu` : `${total} lagu`;
    $("emptyState").hidden = total > 0;
    $("btnSort").textContent = prefs.sort === "az" ? "A–Z" : "Terbaru";
    $("btnShuffleAll").disabled = localCount === 0;

    const remoteOnly = tracks.filter((t) => !t.local && t.remote).length;
    $("cloudBanner").hidden = remoteOnly === 0;
    $("cloudBannerTitle").textContent = `${remoteOnly} lagu belum diunduh`;
    $("cloudBannerText").textContent = "Unduh supaya bisa diputar offline.";

    const playingId = current?.id;
    $("trackList").innerHTML = list.map((t) => {
      const cls = ["track"];
      if (t.id === playingId) cls.push("playing");
      if (!t.local) cls.push("remote");
      let state = "";
      if (busy.has(t.id)) state = ICON.spin;
      else if (t.id === playingId) state = `<span class="eq ${audio.paused ? "paused" : ""}"><i></i><i></i><i></i></span>`;
      else if (!t.local) state = ICON.cloud;
      const sub = [t.artist || "Artis tidak diketahui", t.duration ? fmt(t.duration) : ""].filter(Boolean).join(" · ");
      return `<li class="${cls.join(" ")}" data-id="${t.id}">
        <div class="cover sm" style="${coverStyle(t)}">${coverUrls.get(t.id) ? "" : initial(t)}</div>
        <div class="info"><div class="t">${esc(t.title)}</div><div class="a">${esc(sub)}</div></div>
        <span class="state">${state}</span>
        <button class="more" data-more="${t.id}" aria-label="Opsi">${ICON.more}</button>
      </li>`;
    }).join("");
    $("cloudDot").hidden = !session;
  }

  // ---------- Pemutar ----------
  function setPlayIcons() {
    const icon = audio.paused ? ICON.play : ICON.pause;
    $("btnPlay").innerHTML = icon;
    $("miniPlay").innerHTML = icon;
    $("player").classList.toggle("paused", audio.paused);
    document.querySelectorAll(".track .eq").forEach((e) => e.classList.toggle("paused", audio.paused));
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = current ? (audio.paused ? "paused" : "playing") : "none";
  }
  function setModeIcons() {
    $("btnShuffle").classList.toggle("on", prefs.shuffle);
    $("btnRepeat").classList.toggle("on", prefs.repeat !== "off");
    $("repeatOne").hidden = prefs.repeat !== "one";
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
        album: current.album || "Putar",
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
    $("mini").hidden = !t;
    if (!t) return;
    $("miniTitle").textContent = t.title;
    $("miniArtist").textContent = t.artist || "Artis tidak diketahui";
    $("playerTitle").textContent = t.title;
    $("playerArtist").textContent = t.artist || "Artis tidak diketahui";
    paintCover($("miniCover"), t);
    paintCover($("playerCover"), t);
    const u = coverUrls.get(t.id);
    const bg = $("playerBg");
    bg.style.background = "";
    if (u) bg.style.backgroundImage = `url('${u}')`;
    else bg.style.background = `radial-gradient(circle at 50% 30%, hsl(${hash(t.title + (t.artist || "")) % 360} 60% 40%), transparent 70%)`;
    setPlayIcons();
    render();
  }

  function playFromList(id) {
    const t = byId(id);
    if (!t) return;
    buildQueue(id, visibleTracks());
    if (!t.local) {
      downloadTrack(t).then(() => {
        if (t.local) { buildQueue(id, visibleTracks()); loadTrack(id, true); }
      });
      return;
    }
    loadTrack(id, true);
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
    $("miniBar").style.width = p + "%";
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
    const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
    const m = base.match(/^(.+?)\s+-\s+(.+)$/);
    return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base };
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []).filter(isAudioFile);
    if (!files.length) { toast("Pilih file audio (MP3, M4A, dll.)"); return; }
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    let added = 0;
    const base = Date.now();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      toast(`Menambahkan ${i + 1}/${files.length}…`, 0);
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
          mime: mimeFor(f.name, f.type),
          addedAt: base + i,
          local: true,
          remote: false,
          storagePath: null
        };
        await putBlob(id, f);
        if (tags.cover) {
          await idb.put("covers", tags.cover, id);
          coverUrls.set(id, URL.createObjectURL(tags.cover));
        }
        await idb.put("tracks", meta);
        tracks.push(meta);
        added++;
        if (i % 3 === 0) render();
      } catch (e) {
        console.error(e);
        toast(`Gagal menambahkan ${f.name}`);
        await sleep(1200);
      }
    }
    render();
    toast(`${added} lagu ditambahkan`);
    if (current) { baseQueue = sortedTracks().filter(playable).map((t) => t.id); }
    if (session) uploadPending();
  }
  $("fileInput").addEventListener("change", (e) => { importFiles(e.target.files); e.target.value = ""; });
  $("fileInput2").addEventListener("change", (e) => { importFiles(e.target.files); e.target.value = ""; });

  // ---------- Cloud (Supabase) ----------
  let sb = null;
  let session = null;
  let syncing = false;
  try {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "putar-auth" }
    });
  } catch (e) {
    console.warn("Supabase tidak tersedia", e);
  }

  async function sync({ quiet = false } = {}) {
    if (!sb || !session || syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const { data, error } = await sb.from(cfg.table).select("*").order("created_at", { ascending: true });
      if (error) throw error;
      const remoteIds = new Set();
      for (const row of data) {
        remoteIds.add(row.id);
        let t = byId(row.id);
        if (!t) {
          t = {
            id: row.id, title: row.title, artist: row.artist || "", album: row.album || "",
            duration: row.duration || 0, size: row.size_bytes || 0, mime: row.mime || "audio/mpeg",
            addedAt: Date.parse(row.created_at) || Date.now(), local: false, remote: true, storagePath: row.storage_path
          };
          tracks.push(t);
          await idb.put("tracks", t);
        } else if (!t.remote || t.storagePath !== row.storage_path) {
          t.remote = true;
          t.storagePath = row.storage_path;
          await idb.put("tracks", t);
        }
      }
      for (const t of tracks.slice()) {
        if (t.remote && !remoteIds.has(t.id)) {
          t.remote = false;
          t.storagePath = null;
          if (!t.local) { await removeLocalMeta(t); }
          else await idb.put("tracks", t);
        }
      }
      render();
      await uploadPending();
      if (!quiet) toast("Sinkronisasi selesai");
    } catch (e) {
      console.error(e);
      if (!quiet) toast("Sinkronisasi gagal: " + (e.message || e));
    } finally {
      syncing = false;
      render();
    }
  }

  async function uploadTrack(t) {
    if (!session || busy.has(t.id)) return false;
    const blob = await getBlob(t.id);
    if (!blob) return false;
    if (blob.size > 50 * 1024 * 1024) { toast(`${t.title} lebih dari 50 MB, tidak diunggah`); return false; }
    busy.add(t.id); render();
    try {
      const mime = t.mime || "audio/mpeg";
      const path = `${session.user.id}/${t.id}.${extForMime(mime)}`;
      const up = await sb.storage.from(cfg.bucket).upload(path, blob, { contentType: mime, upsert: true });
      if (up.error) throw up.error;
      const ins = await sb.from(cfg.table).upsert({
        id: t.id, title: t.title, artist: t.artist || null, album: t.album || null,
        duration: t.duration || null, storage_path: path, size_bytes: blob.size, mime
      });
      if (ins.error) throw ins.error;
      t.remote = true;
      t.storagePath = path;
      await idb.put("tracks", t);
      return true;
    } catch (e) {
      console.error(e);
      toast(`Gagal mengunggah ${t.title}: ${e.message || e}`);
      return false;
    } finally {
      busy.delete(t.id); render();
    }
  }
  async function uploadPending() {
    const pending = tracks.filter((t) => t.local && !t.remote);
    for (let i = 0; i < pending.length; i++) {
      toast(`Mengunggah ke cloud ${i + 1}/${pending.length}…`, 0);
      await uploadTrack(pending[i]);
    }
    if (pending.length) toast("Semua lagu sudah tersimpan di cloud");
  }

  async function downloadTrack(t) {
    if (t.local || busy.has(t.id)) return;
    if (!session) { toast("Masuk dulu untuk mengunduh dari cloud"); openAccount(); return; }
    if (!navigator.onLine) { toast("Tidak ada internet"); return; }
    busy.add(t.id); render();
    try {
      const { data, error } = await sb.storage.from(cfg.bucket).download(t.storagePath);
      if (error) throw error;
      const blob = data.type ? data : new Blob([data], { type: t.mime || "audio/mpeg" });
      await putBlob(t.id, blob);
      const tags = await window.readID3(blob);
      if (tags.cover) {
        await idb.put("covers", tags.cover, t.id);
        coverUrls.set(t.id, URL.createObjectURL(tags.cover));
      }
      t.local = true;
      await idb.put("tracks", t);
    } catch (e) {
      console.error(e);
      toast(`Gagal mengunduh ${t.title}`);
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
      else { $("mini").hidden = true; closePlayer(); setPlayIcons(); }
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
    if (!session) { toast("Masuk dulu"); return; }
    busy.add(t.id); render();
    try {
      if (t.storagePath) {
        const r = await sb.storage.from(cfg.bucket).remove([t.storagePath]);
        if (r.error) throw r.error;
      }
      const d = await sb.from(cfg.table).delete().eq("id", t.id);
      if (d.error) throw d.error;
      t.remote = false;
      t.storagePath = null;
      if (alsoLocal || !t.local) {
        stopIfCurrent(t);
        await idb.del("blobs", t.id).catch(() => {});
        await removeLocalMeta(t);
      } else {
        await idb.put("tracks", t);
      }
      toast(alsoLocal ? "Dihapus dari semua tempat" : "Dihapus dari cloud");
    } catch (e) {
      console.error(e);
      toast("Gagal menghapus: " + (e.message || e));
    } finally {
      busy.delete(t.id); render();
    }
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
    return `<div class="sheet-track"><div class="cover sm" style="${coverStyle(t)}">${coverUrls.get(t.id) ? "" : initial(t)}</div>
      <div><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist || "Artis tidak diketahui")}${t.size ? " · " + bytes(t.size) : ""}</div></div></div>`;
  }
  function openTrackMenu(id) {
    const t = byId(id);
    if (!t) return;
    const items = [];
    if (t.local) items.push(`<li><button data-act="playnext">${ICON.next}Putar berikutnya</button></li>`);
    items.push(`<li><button data-act="rename">${ICON.edit}Ubah judul & artis</button></li>`);
    if (!t.local && t.remote) items.push(`<li><button data-act="download">${ICON.cloud}Unduh untuk offline</button></li>`);
    if (t.local && !t.remote && session) items.push(`<li><button data-act="upload">${ICON.upload}Simpan ke cloud</button></li>`);
    if (t.local) items.push(`<li><button data-act="dellocal" class="${t.remote ? "" : "danger"}">${t.remote ? ICON.phone : ICON.trash}${t.remote ? "Hapus dari perangkat (tetap di cloud)" : "Hapus lagu"}</button></li>`);
    if (t.remote) items.push(`<li><button data-act="delall" class="danger">${ICON.trash}Hapus dari semua tempat</button></li>`);
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
        closeSheet(); downloadTrack(t);
      } else if (act === "upload") {
        closeSheet(); uploadTrack(t).then((ok) => ok && toast("Tersimpan di cloud"));
      } else if (act === "dellocal") {
        confirmSheet(t, t.remote ? "Hapus file dari iPhone ini? Lagu masih bisa diunduh lagi dari cloud." : "Hapus lagu ini dari perangkat? Lagu belum tersimpan di cloud, jadi akan hilang permanen.", () => deleteFromDevice(t));
      } else if (act === "delall") {
        confirmSheet(t, "Hapus lagu ini dari cloud dan dari perangkat ini?", () => deleteFromCloud(t, true));
      }
    };
  }
  function confirmSheet(t, msg, fn) {
    openSheet(`${trackHeader(t)}<p class="sub">${esc(msg)}</p>
      <div class="row"><button class="btn-secondary" data-c="no">Batal</button><button class="btn-primary" data-c="yes" style="background:#ff6b6b">Hapus</button></div>`);
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
        <div class="row"><button type="button" class="btn-secondary" id="rnCancel">Batal</button><button class="btn-primary">Simpan</button></div>
      </form>`);
    $("sheetBody").onclick = null;
    $("rnCancel").onclick = closeSheet;
    $("renameForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      t.title = String(fd.get("title")).trim() || t.title;
      t.artist = String(fd.get("artist")).trim();
      await idb.put("tracks", t);
      if (t.remote && session) sb.from(cfg.table).update({ title: t.title, artist: t.artist || null }).eq("id", t.id).then(() => {});
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
    if (!session) {
      openSheet(`<h3>Simpan ke cloud</h3>
        <p class="sub">Tanpa login, lagu tetap tersimpan offline di perangkat ini. Login supaya lagu juga tersimpan di cloud dan bisa diunduh lagi kapan saja. Pakai akun yang sama dengan Lajur.</p>
        <form id="loginForm">
          <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
          <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
          <div class="err" id="loginErr"></div>
          <button class="btn-primary" style="width:100%" id="loginBtn">Masuk</button>
        </form>
        <div style="margin-top:14px">${storageLine}<div class="stat">Di perangkat: <b>${localN} lagu</b></div></div>
        ${tip}`);
      $("sheetBody").onclick = null;
      $("loginForm").onsubmit = async (e) => {
        e.preventDefault();
        if (!sb) { $("loginErr").textContent = "Layanan cloud tidak tersedia"; return; }
        const fd = new FormData(e.target);
        $("loginBtn").disabled = true;
        $("loginErr").textContent = "";
        const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
        $("loginBtn").disabled = false;
        if (error) { $("loginErr").textContent = error.message === "Invalid login credentials" ? "Email atau password salah" : error.message; return; }
        closeSheet();
        toast("Berhasil masuk, menyinkronkan…");
        setTimeout(() => sync(), 300);
      };
      return;
    }
    const remoteN = tracks.filter((t) => t.remote).length;
    const notDl = tracks.filter((t) => t.remote && !t.local).length;
    const notUp = tracks.filter((t) => t.local && !t.remote).length;
    openSheet(`<h3>Cloud</h3>
      <p class="sub">Masuk sebagai ${esc(session.user.email)}</p>
      <div class="stat">Di cloud: <b>${remoteN} lagu</b> · Di perangkat: <b>${localN} lagu</b>${notDl ? `<br>${notDl} lagu belum diunduh` : ""}${notUp ? `<br>${notUp} lagu belum diunggah` : ""}</div>
      ${storageLine}
      <div class="row" style="margin-bottom:10px">
        <button class="btn-primary" data-a="sync">Sinkronkan</button>
        ${notDl ? `<button class="btn-secondary" data-a="dl">Unduh semua</button>` : ""}
      </div>
      <button class="btn-secondary" style="width:100%" data-a="logout">Keluar</button>
      ${tip}`);
    $("sheetBody").onclick = async (e) => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      closeSheet();
      if (b.dataset.a === "sync") sync();
      else if (b.dataset.a === "dl") downloadAll();
      else if (b.dataset.a === "logout") {
        await sb.auth.signOut();
        toast("Keluar. Lagu di perangkat tetap ada.");
      }
    };
  }

  // ---------- Player full screen ----------
  function openPlayer() {
    if (!current) return;
    $("player").classList.add("open");
    $("player").setAttribute("aria-hidden", "false");
  }
  function closePlayer() {
    $("player").classList.remove("open");
    $("player").setAttribute("aria-hidden", "true");
  }
  // Geser ke bawah untuk menutup
  (() => {
    let y0 = null;
    const el = $("player");
    el.addEventListener("touchstart", (e) => {
      if (e.target.closest(".seek") || e.target.closest(".controls")) { y0 = null; return; }
      y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      if (dy > 110) closePlayer();
      y0 = null;
    }, { passive: true });
  })();

  // ---------- Event UI ----------
  $("trackList").addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) { e.stopPropagation(); openTrackMenu(more.dataset.more); return; }
    const li = e.target.closest(".track");
    if (!li) return;
    const id = li.dataset.id;
    if (current && current.id === id) { openPlayer(); if (audio.paused) audio.play().catch(() => {}); return; }
    playFromList(id);
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
  $("btnDownloadAll").addEventListener("click", downloadAll);
  $("btnAccount").addEventListener("click", openAccount);
  $("miniOpen").addEventListener("click", openPlayer);
  $("miniPlay").addEventListener("click", togglePlay);
  $("miniNext").addEventListener("click", () => next(false));
  $("btnPlay").addEventListener("click", togglePlay);
  $("btnNext").addEventListener("click", () => next(false));
  $("btnPrev").addEventListener("click", prev);
  $("btnShuffle").addEventListener("click", toggleShuffle);
  $("btnRepeat").addEventListener("click", cycleRepeat);
  $("btnBack10").addEventListener("click", () => skip(-10));
  $("btnFwd10").addEventListener("click", () => skip(10));
  $("playerClose").addEventListener("click", closePlayer);
  $("playerMore").addEventListener("click", () => current && openTrackMenu(current.id));
  window.addEventListener("online", () => sync({ quiet: true }));

  // ---------- Mulai ----------
  async function init() {
    setModeIcons();
    setPlayIcons();
    try {
      tracks = (await idb.all("tracks")) || [];
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

    if (sb) {
      const { data } = await sb.auth.getSession();
      session = data.session;
      render();
      if (session) sync({ quiet: true });
      sb.auth.onAuthStateChange((ev, s) => {
        session = s;
        setTimeout(() => {
          render();
          if (ev === "SIGNED_IN") sync({ quiet: true });
        }, 0);
      });
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }
  init();
})();
