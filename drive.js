// Cloud Saku: login Google + penyimpanan di folder "Saku" di Google Drive milik pengguna.
// Scope drive.file: app hanya bisa melihat dan mengubah file yang dibuatnya sendiri.
(function () {
  const cfg = window.SAKU_CONFIG || {};
  const SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  const LS_USER = "saku:google-user";
  const LS_TOKEN = "saku:google-token";

  let tokenClient = null;
  let token = null;
  let tokenExp = 0;
  let user = null;
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

  function ensureClient() {
    if (tokenClient) return true;
    if (!configured() || !gisReady()) return false;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.googleClientId,
      scope: SCOPE,
      callback: () => {}
    });
    return true;
  }

  // Harus dipanggil langsung dari tap/klik pengguna, karena membuka jendela Google.
  function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      if (!configured()) return reject(new Error("Login Google belum diaktifkan"));
      if (!ensureClient()) return reject(new Error("Layanan Google belum termuat. Cek internet lalu coba lagi"));
      tokenClient.callback = async (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, "https://www.googleapis.com/auth/drive.file")) {
          return reject(new Error("Izin Google Drive tidak diberikan. Centang izin Drive saat login"));
        }
        token = resp.access_token;
        tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        try { localStorage.setItem(LS_TOKEN, JSON.stringify({ token, exp: tokenExp })); } catch (e) {}
        try {
          const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + token } });
          if (r.ok) {
            const u = await r.json();
            user = { email: u.email, name: u.name || u.email, picture: u.picture || "" };
            localStorage.setItem(LS_USER, JSON.stringify(user));
          }
        } catch (e) {}
        emit();
        resolve(token);
      };
      tokenClient.error_callback = (err) => {
        reject(new Error(err && err.type === "popup_closed" ? "Jendela login ditutup" : err && err.type === "popup_failed_to_open" ? "Pop-up diblokir. Izinkan pop-up untuk situs ini" : "Login Google gagal"));
      };
      const opts = { prompt: interactive ? "select_account" : "" };
      if (user && user.email && !interactive) opts.login_hint = user.email;
      tokenClient.requestAccessToken(opts);
    });
  }

  // Pastikan ada token yang masih berlaku; kalau habis, minta lagi (perlu tap pengguna).
  function withToken() {
    if (hasToken()) return Promise.resolve(token);
    return requestToken(false);
  }

  function signOut() {
    const t = token;
    token = null; tokenExp = 0; user = null;
    try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); } catch (e) {}
    try { if (t && gisReady()) google.accounts.oauth2.revoke(t, () => {}); } catch (e) {}
    emit();
  }

  async function api(url, opts = {}) {
    const tk = await withToken();
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + tk } });
    if (res.status === 401) {
      token = null; tokenExp = 0;
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
    do {
      const q = encodeURIComponent(`trashed=false and mimeType contains 'audio/'`);
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
          if (data.action === P.Action.PICKED) resolve((data.docs || []).map((x) => ({ id: x.id, name: x.name, mimeType: x.mimeType, size: x.sizeBytes })));
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

  window.SakuDrive = {
    configured, hasToken, withToken, requestToken, signOut,
    get user() { return user; },
    onChange: (fn) => listeners.add(fn),
    list, upload, download, remove, removeAll, updateMeta,
    ensureFolder: () => folderId(true),
    pick, fileInfo,
    pickerEnabled: () => configured() && !!cfg.googleApiKey
  };
})();
