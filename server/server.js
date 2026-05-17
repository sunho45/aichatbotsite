const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");

require("./config/user.js");

const { clientDist, MAX_UPLOAD_SIZE, PORT, serverRoot } = require("./config/runtime");
const { TRANSPORT_HEADERS } = require("./config/protocol");
const { createApiRouter, handleProtocolMetadata } = require("./routes/api");
const { serveReactApp } = require("./routes/reactApp");
const { attachTransportHeaders } = require("./middleware/transportHeaders");
const { handleError, handleNotFound } = require("./middleware/errorHandlers");
const { handleWebSocketUpgrade } = require("./websocket/chatSocket");
const { handleAsync } = require("./utils/asyncHandler");

const app = express();
const server = http.createServer(app);

const statePagePath = path.join(serverRoot, "state.html");
const blueprintPagePath = path.join(serverRoot, "blueprint.html");
const serverGrammarPagePath = path.join(serverRoot, "servergrammar.html");
const guidePages = new Map(
  ["git.html", "javascript.html", "nginx.html", "docker.html", "docker-compose.html"].map((fileName) => [
    `/${fileName}`,
    path.join(serverRoot, fileName),
  ])
);

app.set("trust proxy", 1);
app.use(cors({ exposedHeaders: TRANSPORT_HEADERS }));
app.use(express.json({ limit: MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_UPLOAD_SIZE }));
app.use(attachTransportHeaders);

app.get("/.well-known/ai-server.json", handleAsync(handleProtocolMetadata));
app.use("/api", createApiRouter());

app.get("/blueprint.html", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(blueprintPagePath);
});

app.get("/servergrammar.html", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(serverGrammarPagePath);
});

for (const [route, pagePath] of guidePages) {
  app.get(route, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(pagePath);
  });
}

app.get(["/state.html", "/server-state.html", "/state/:code"], (req, res) => {
  const statusCode = Number(req.params.code || req.query.code || 200);

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    res.status(statusCode);
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(statePagePath);
});

app.use(
  express.static(clientDist, {
    setHeaders(res, filePath) {
      if (path.extname(filePath).toLowerCase() === ".html") {
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
  console.log(`API server running on port ${PORT}`);
});
