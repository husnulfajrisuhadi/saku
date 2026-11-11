// Utilitas server untuk login permanen Saku.
// Refresh token Google disimpan terenkripsi (AES-256-GCM) di cookie HttpOnly milik browser pengguna.
// Server tidak menyimpan data apa pun.
const crypto = require("crypto");

const COOKIE = "saku_rt";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 hari

function key() {
  const k = process.env.SAKU_COOKIE_KEY || "";
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("SAKU_COOKIE_KEY belum diatur");
  return buf;
}

function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

function open(sealed) {
  try {
    const b = Buffer.from(sealed, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

function readCookie(req) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return open(decodeURIComponent(v.join("=")));
  }
  return null;
}

function setCookie(res, refreshToken) {
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(seal(refreshToken))}; Path=/api/auth; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`);
}

function clearCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

async function google(params) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    ...params
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

// Tolak permintaan dari situs lain
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

module.exports = { readCookie, setCookie, clearCookie, google, send, sameOrigin };
