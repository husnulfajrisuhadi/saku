// Cloud Saku: login Google + penyimpanan di folder "Saku" di Google Drive milik pengguna.
// Scope drive.file: app hanya bisa melihat dan mengubah file yang dibuatnya sendiri.
(function () {
  const cfg = window.SAKU_CONFIG || {};
  const SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  const LS_USER = "saku:google-user";
  const LS_TOKEN = "saku:google-token";
  const LS_READALL = "saku:read-all";
  // Izin opsional: baca semua isi folder Saku (termasuk file yang ditaruh lewat Google Drive)
  const READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
  let readAll = false;
  try { readAll = localStorage.getItem(LS_READALL) === "1"; } catch (e) {}

  let codeClient = null;
  let token = null;
  let tokenExp = 0;
  let user = null;
  let silentInflight = null;
  const listeners = new Set();

  try { user = JSON.parse(localStorage.getItem(LS_USER) || "null"); } catch (e) {}
  try {
    const t = JSON.parse(localStorage.getItem(LS_TOKEN) || "null");
    if (t && t.exp > Date.now() + 60000) { token = t.token; tokenExp = t.exp; }
  } catch (e) {}

  const emit = () => listeners.forEach((fn) => { try { fn(user); } catch (e) {} });
  const configured = () => !!cfg.googleClientId;
  const gisReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
  const hasToken = () => !!token && Date.now() < tokenExp;

  // Simpan token baru dari server + perbarui status izin baca folder
  async function accept(data, wantReadAll) {
    const scope = String(data.scope || "");
    if (!scope.includes("auth/drive.file")) throw new Error("Izin Google Drive tidak diberikan. Centang izin Drive saat login");
    const hasRead = scope.includes(READ_SCOPE);
    if (wantReadAll && !hasRead) throw new Error("Izin baca folder tidak diberikan. Centang izin melihat file Google Drive");
    readAll = hasRead;
    token = data.access_token;
    tokenExp = Date.now() + (Number(data.expires_in || 3600) - 60) * 1000;
    try {
      localStorage.setItem(LS_READALL, readAll ? "1" : "0");
      localStorage.setItem(LS_TOKEN, JSON.stringify({ token, exp: tokenExp }));
    } catch (e) {}
    // Beri tahu service worker supaya streaming bisa memakai token terbaru
    try { navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({ type: "token", token, exp: tokenExp }); } catch (e) {}
    if (!user || !user.email) {
      try {
        const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + token } });
        if (r.ok) {
          const u = await r.json();
          user = { email: u.email, name: u.name || u.email, picture: u.picture || "" };
          localStorage.setItem(LS_USER, JSON.stringify(user));
        }
      } catch (e) {}
    }
    emit();
    return token;
  }

  // Login pop-up Google (sekali). Kodenya ditukar di server supaya sesi bisa diperpanjang otomatis.
  // Harus dipanggil langsung dari tap/klik pengguna.
  // Cek sekali: server sudah siap untuk login permanen? Kalau belum, pakai token biasa (±1 jam).
  let serverAuth = null;
  fetch("/api/auth/status", { cache: "no-store" }).then((r) => r.json()).then((j) => { serverAuth = !!j.persistent; }).catch(() => { serverAuth = false; });

  function requestToken(interactive, wantReadAll) {
    return new Promise((resolve, reject) => {
      if (!configured()) return reject(new Error("Login Google belum diaktifkan"));
      if (!gisReady()) return reject(new Error("Layanan Google belum termuat. Cek internet lalu coba lagi"));
      const scope = SCOPE + (wantReadAll || readAll ? " " + READ_SCOPE : "");
      if (serverAuth === false) {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: cfg.googleClientId,
          scope,
          include_granted_scopes: true,
          login_hint: user && user.email ? user.email : undefined,
          prompt: wantReadAll || interactive ? "consent" : "",
          callback: (resp) => {
            if (resp.error) return reject(new Error(resp.error_description || resp.error));
            accept(resp, wantReadAll).then(resolve, reject);
          },
          error_callback: (err) => reject(new Error(err && err.type === "popup_closed" ? "Jendela login ditutup" : err && err.type === "popup_failed_to_open" ? "Pop-up diblokir. Izinkan pop-up untuk situs ini" : "Login Google gagal"))
        });
        tc.requestAccessToken();
        return;
      }
      codeClient = google.accounts.oauth2.initCodeClient({
        client_id: cfg.googleClientId,
        scope,
        ux_mode: "popup",
        include_granted_scopes: true,
        login_hint: user && user.email ? user.email : undefined,
        prompt: wantReadAll || interactive ? "consent" : "",
        callback: async (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          try {
            const r = await fetch("/api/auth/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ code: resp.code })
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error("Login gagal (" + (j.error || r.status) + ")");
            resolve(await accept(j, wantReadAll));
          } catch (e) { reject(e); }
        },
        error_callback: (err) => {
          reject(new Error(err && err.type === "popup_closed" ? "Jendela login ditutup" : err && err.type === "popup_failed_to_open" ? "Pop-up diblokir. Izinkan pop-up untuk situs ini" : "Login Google gagal"));
        }
      });
      codeClient.requestCode();
    });
  }

  // Perpanjang sesi diam-diam lewat server (tanpa pop-up). Null kalau belum pernah login permanen.
  function refreshSilent() {
    if (silentInflight) return silentInflight;
    silentInflight = (async () => {
      try {
        const r = await fetch("/api/auth/token", { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return null;
        return await accept(await r.json());
      } catch (e) {
        return null;
      } finally {
        setTimeout(() => { silentInflight = null; }, 0);
      }
    })();
    return silentInflight;
  }

  // Token yang masih berlaku: dari memori, diperpanjang diam-diam, atau (terakhir) login ulang.
  async function withToken() {
    if (hasToken()) return token;
    if (user) {
      const t = await refreshSilent();
      if (t) return t;
    }
    return requestToken(false);
  }

  // Perpanjang token sebelum habis supaya streaming di layar terkunci tidak terputus
  setInterval(() => {
    if (user && token && tokenExp - Date.now() < 10 * 60 * 1000) refreshSilent();
  }, 60 * 1000);

  function signOut() {
    token = null; tokenExp = 0; user = null; readAll = false;
    try {
      localStorage.removeItem(LS_READALL);
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_USER);
    } catch (e) {}
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    try { navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({ type: "token", token: null, exp: 0 }); } catch (e) {}
    emit();
  }

  async function api(url, opts = {}) {
    const tk = await withToken();
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + tk } });
    if (res.status === 401) {
      token = null; tokenExp = 0;
      // Coba perpanjang diam-diam sekali, lalu ulangi permintaan
      const t2 = user ? await refreshSilent() : null;
      if (t2 && !opts.__retried) return api(url, { ...opts, __retried: true });
      throw new Error("Sesi Google habis. Tekan tombol lagi untuk masuk ulang");
    }
    if (!res.ok) {
      let msg = res.status + "";
      try { const j = await res.json(); msg = (j.error && (j.error.message || j.error.status)) || msg; } catch (e) {}
      if (/storageQuotaExceeded|quota/i.test(msg)) msg = "Penyimpanan Google Drive penuh";
      throw new Error(msg);
    }
    return res;
  }

  // ---------- Folder "Saku" ----------
  const folderKey = () => "saku:folder:" + (user ? user.email : "");
  async function folderId(create = true) {
    let id = null;
    try { id = localStorage.getItem(folderKey()); } catch (e) {}
    if (id) {
      try {
        const r = await api(`${API}/files/${id}?fields=id,trashed`);
        const j = await r.json();
        if (!j.trashed) return id;
      } catch (e) {}
    }
    const q = encodeURIComponent(`name='${cfg.driveFolderName || "Saku"}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r = await api(`${API}/files?q=${q}&fields=files(id)&spaces=drive`);
    const j = await r.json();
    id = j.files && j.files[0] && j.files[0].id;
    if (!id && create) {
      const c = await api(`${API}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cfg.driveFolderName || "Saku", mimeType: "application/vnd.google-apps.folder" })
      });
      id = (await c.json()).id;
    }
    if (id) try { localStorage.setItem(folderKey(), id); } catch (e) {}
    return id || null;
  }

  // appProperties dibatasi ±124 byte per pasangan kunci+nilai
  function clip(s, max = 110) {
    s = String(s || "");
    const enc = new TextEncoder();
    while (enc.encode(s).length > max) s = s.slice(0, -1);
    return s;
  }
  function props(t) {
    return { sid: t.id, t: clip(t.title), a: clip(t.artist), al: clip(t.album), d: String(Math.round(t.duration || 0)) };
  }

  // Semua file audio yang boleh diakses Saku: yang dibuat Saku dan yang dipilih lewat "Ambil dari Drive"
  async function list() {
    const out = [];
    let pageToken = "";
    let base = "trashed=false and mimeType contains 'audio/'";
    if (readAll) {
      // Dengan izin baca, cukup isi folder Saku (supaya audio lain di Drive tidak ikut masuk)
      const fid = await folderId(true);
      base = `'${fid}' in parents and ` + base;
    }
    do {
      const q = encodeURIComponent(base);
      const r = await api(`${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,size,mimeType,createdTime,appProperties)${pageToken ? "&pageToken=" + pageToken : ""}`);
      const j = await r.json();
      out.push(...(j.files || []));
      pageToken = j.nextPageToken || "";
    } while (pageToken);
    return out;
  }

  async function upload(t, blob, fileName) {
    const fid = await folderId(true);
    const meta = { name: fileName, parents: [fid], mimeType: t.mime || blob.type || "audio/mpeg", appProperties: props(t) };
    const init = await api(`${UPLOAD}?uploadType=resumable&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": meta.mimeType, "X-Upload-Content-Length": String(blob.size) },
      body: JSON.stringify(meta)
    });
    const loc = init.headers.get("Location");
    if (!loc) throw new Error("Google Drive tidak memberi alamat unggah");
    const put = await fetch(loc, { method: "PUT", headers: { "Content-Type": meta.mimeType }, body: blob });
    if (!put.ok) throw new Error("Unggah gagal (" + put.status + ")");
    return (await put.json()).id;
  }

  async function download(fileId) {
    const r = await api(`${API}/files/${fileId}?alt=media`);
    return r.blob();
  }

  async function remove(fileId) {
    await api(`${API}/files/${fileId}`, { method: "DELETE" });
  }

  async function updateMeta(fileId, t) {
    await api(`${API}/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appProperties: props(t) })
    });
  }

  // Hapus folder Saku beserta seluruh isinya
  async function removeAll() {
    const fid = await folderId(false);
    if (!fid) return;
    await api(`${API}/files/${fid}`, { method: "DELETE" });
    try { localStorage.removeItem(folderKey()); } catch (e) {}
  }


  // ---------- Google Picker: pilih lagu yang sudah ada di Drive ----------
  let pickerReady = null;
  function loadPicker() {
    if (window.google && google.picker) return Promise.resolve();
    return (pickerReady ||= new Promise((resolve, reject) => {
      const done = () => gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("Gagal memuat pemilih file Google")) });
      if (window.gapi) return done();
      const s = document.createElement("script");
      s.src = "https://apis.google.com/js/api.js";
      s.onload = done;
      s.onerror = () => { pickerReady = null; reject(new Error("Gagal memuat pemilih file Google. Cek internet")); };
      document.head.appendChild(s);
    }));
  }
  const AUDIO_MIMES = "audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/ogg,audio/aiff,audio/x-aiff,audio/webm";

  async function pick() {
    if (!cfg.googleApiKey) throw new Error("Pemilih Drive belum diaktifkan");
    const tk = await withToken();
    const [, fid] = await Promise.all([loadPicker(), folderId(true).catch(() => null)]);
    return new Promise((resolve) => {
      const P = google.picker;
      const inSaku = new P.DocsView(P.ViewId.DOCS).setMimeTypes(AUDIO_MIMES).setMode(P.DocsViewMode.LIST);
      if (fid) inSaku.setParent(fid);
      inSaku.setLabel ? inSaku.setLabel("Folder Saku") : null;
      const all = new P.DocsView(P.ViewId.DOCS).setMimeTypes(AUDIO_MIMES).setMode(P.DocsViewMode.LIST).setIncludeFolders(true);
      all.setLabel ? all.setLabel("Semua Drive") : null;
      const picker = new P.PickerBuilder()
        .addView(inSaku)
        .addView(all)
        .enableFeature(P.Feature.MULTISELECT_ENABLED)
        .setMaxItems(500)
        .setOAuthToken(tk)
        .setDeveloperKey(cfg.googleApiKey)
        .setAppId(cfg.googleAppId)
        .setOrigin(location.protocol + "//" + location.host)
        .setTitle("Pilih lagu untuk Saku")
        .setCallback((data) => {
          if (data.action === P.Action.PICKED) resolve((data.docs || []).map((x) => ({ id: x.id, name: x.name, mimeType: x.mimeType, size: x.sizeBytes, outside: !!fid && x.parentId !== fid })));
          else if (data.action === P.Action.CANCEL) resolve([]);
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function fileInfo(id) {
    const r = await api(`${API}/files/${id}?fields=id,name,size,mimeType,createdTime,appProperties`);
    return r.json();
  }


  // ---------- Playlist: disimpan sebagai saku-playlists.json di folder Saku ----------
  const PL_NAME = "saku-playlists.json";
  async function findPlaylistFile() {
    const fid = await folderId(true);
    const q = encodeURIComponent(`name='${PL_NAME}' and '${fid}' in parents and trashed=false`);
    const r = await api(`${API}/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive`);
    const j = await r.json();
    return { fid, file: j.files && j.files[0] };
  }
  async function readPlaylists() {
    const { file } = await findPlaylistFile();
    if (!file) return null;
    const r = await api(`${API}/files/${file.id}?alt=media`);
    try { return await r.json(); } catch (e) { return null; }
  }
  async function writePlaylists(data) {
    const { fid, file } = await findPlaylistFile();
    const body = JSON.stringify(data);
    if (file) {
      await api(`${UPLOAD}/${file.id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
      return;
    }
    const boundary = "saku" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: PL_NAME, parents: [fid], mimeType: "application/json" });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await api(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body: multipart });
  }

  window.SakuDrive = {
    configured, hasToken, withToken, requestToken, signOut, refreshSilent,
    token: () => (hasToken() ? token : null),
    readAll: () => readAll,
    enableReadAll: () => requestToken(true, true),
    get user() { return user; },
    onChange: (fn) => listeners.add(fn),
    list, upload, download, remove, removeAll, updateMeta,
    ensureFolder: () => folderId(true),
    pick, fileInfo, readPlaylists, writePlaylists,
    pickerEnabled: () => configured() && !!cfg.googleApiKey
  };
})();
