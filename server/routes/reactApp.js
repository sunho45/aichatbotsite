const fs = require("fs");
const path = require("path");

// React app route module.
// Serves the built frontend for non-API routes and reports a clear error when
// the client build output does not exist yet.
const { clientDist } = require("../config/runtime");

function serveReactApp(req, res) {
  const indexPath = path.join(clientDist, "index.html");

  if (!fs.existsSync(indexPath)) {
    res.status(404).json({
      error: "React build not found. Run npm run build in client/vite_project.",
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(indexPath);
}

module.exports = { serveReactApp };
