// URL utility module.
// Derives HTTP and WebSocket base URLs from request headers, including reverse
// proxy headers used by deployed hosting platforms.
const { PORT } = require("../config/runtime");

function getBaseUrl(req) {
  const forwardedHost = req.get("x-forwarded-host");
  const host = forwardedHost || req.get("host") || `localhost:${PORT}`;
  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "http";

  return `${protocol}://${host}`;
}

function getWebSocketBaseUrl(req) {
  const baseUrl = getBaseUrl(req);
  return baseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

module.exports = { getBaseUrl, getWebSocketBaseUrl };
