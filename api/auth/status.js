// Apakah login permanen (refresh token di server) sudah dikonfigurasi?
module.exports = (req, res) => {
  const ok = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SAKU_COOKIE_KEY);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ persistent: ok }));
};
