// Tukar kode login Google (dari pop-up) menjadi access token + simpan refresh token di cookie.
const { setCookie, google, send, sameOrigin } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
  const code = req.body && req.body.code;
  if (!code) return send(res, 400, { error: "code" });
  try {
    const r = await google({ code, grant_type: "authorization_code", redirect_uri: "postmessage" });
    if (!r.ok) return send(res, 400, { error: r.data.error || "exchange_failed", detail: r.data.error_description });
    if (r.data.refresh_token) setCookie(res, r.data.refresh_token);
    send(res, 200, { access_token: r.data.access_token, expires_in: r.data.expires_in, scope: r.data.scope, persistent: !!r.data.refresh_token });
  } catch (e) {
    send(res, 500, { error: "server", detail: e.message });
  }
};
