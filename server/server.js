const http = require("http");
const express = require("express");
const cors = require("cors");

// Main application entry point.
// This file wires together config, middleware, routes, static assets, WebSocket
// upgrades, and startup. Feature logic lives in the modules it imports.
const { PORT, MAX_UPLOAD_SIZE, clientDist } = require("./config/runtime");
const { TRANSPORT_HEADERS } = require("./config/protocol");
const { createApiRouter, handleProtocolMetadata } = require("./routes/api");
const { serveReactApp } = require("./routes/reactApp");
const { attachTransportHeaders } = require("./middleware/transportHeaders");
const { handleError, handleNotFound } = require("./middleware/errorHandlers");
const { handleAsync } = require("./utils/asyncHandler");
const { handleWebSocketUpgrade } = require("./websocket/chatSocket");

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

app.use(cors({ exposedHeaders: TRANSPORT_HEADERS }));
app.use(express.json({ limit: MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_UPLOAD_SIZE }));
app.use(attachTransportHeaders);

app.use("/api", createApiRouter());
app.get("/.well-known/ai-server.json", handleAsync(handleProtocolMetadata));

app.use(
  express.static(clientDist, {
    setHeaders(res, filePath) {
      if (filePath.toLowerCase().endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
        return;
      }

      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  })
);

app.get("*", serveReactApp);
app.use(handleNotFound);
app.use(handleError);

server.on("upgrade", handleWebSocketUpgrade);

server.listen(PORT, () => {
  console.log("API server running at https://aichatbotsite.onrender.com");
});
