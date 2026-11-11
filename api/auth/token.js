// Ambil access token baru memakai refresh token di cookie, tanpa pop-up login.
const { readCookie, clearCookie, google, send, sameOrigin } = require("../_lib");

module.exports = async (req, res) => {
  if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
  let rt;
  try { rt = readCookie(req); } catch (e) { return send(res, 500, { error: "server", detail: e.message }); }
  if (!rt) return send(res, 401, { error: "no_session" });
  try {
    const r = await google({ refresh_token: rt, grant_type: "refresh_token" });
    if (!r.ok) {
      if (r.data.error === "invalid_grant") clearCookie(res);
      return send(res, 401, { error: r.data.error || "refresh_failed" });
    }
    send(res, 200, { access_token: r.data.access_token, expires_in: r.data.expires_in, scope: r.data.scope });
  } catch (e) {
    send(res, 500, { error: "server", detail: e.message });
  }
};
