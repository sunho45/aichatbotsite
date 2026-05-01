// Transport header middleware.
// Adds protocol-identifying headers to API responses so clients can discover
// which custom transport contract this server is using.
const {
  SERVER_NAME,
  PROTOCOL_REVISION,
  TRANSPORT_HEADERS,
} = require("../config/protocol");

function attachTransportHeaders(req, res, next) {
  if (req.path.startsWith("/api/")) {
    res.setHeader(TRANSPORT_HEADERS[0], SERVER_NAME);
    res.setHeader(TRANSPORT_HEADERS[1], PROTOCOL_REVISION);
    res.setHeader(TRANSPORT_HEADERS[2], "http-json");
  }

  next();
}

module.exports = { attachTransportHeaders };
