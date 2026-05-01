// Error middleware module.
// Centralizes 404 and error response formatting for JSON APIs, including large
// body and malformed JSON cases produced by Express body parsing.
const { MAX_UPLOAD_SIZE } = require("../config/runtime");

function handleNotFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

function handleError(error, req, res, next) {
  console.error(error);

  if (error.type === "entity.too.large") {
    res.status(413).json({
      error: `Upload is too large. Maximum request size is ${MAX_UPLOAD_SIZE}.`,
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  res.status(500).json({ error: "Server error" });
}

module.exports = { handleNotFound, handleError };
