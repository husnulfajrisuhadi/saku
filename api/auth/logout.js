// Keluar: cabut refresh token di Google dan hapus cookie.
const { readCookie, clearCookie, send, sameOrigin } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
  let rt = null;
  try { rt = readCookie(req); } catch (e) {}
  if (rt) {
    try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(rt), { method: "POST" }); } catch (e) {}
  }
  clearCookie(res);
  send(res, 200, { ok: true });
};
