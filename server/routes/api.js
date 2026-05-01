const express = require("express");

// API route module.
// Owns HTTP route definitions and delegates work to service modules so request
// handlers stay small and easy to scan.
const { handleAsync } = require("../utils/asyncHandler");
const { createChatCompletion } = require("../services/chatService");
const { streamVoice } = require("../services/voiceService");
const { buildProtocolMetadata } = require("../services/protocolService");

function createApiRouter() {
  const router = express.Router();

  router.get(
    ["/protocol", "/metadata", "/.well-known/ai-server.json"],
    handleAsync(handleProtocolMetadata)
  );
  router.post("/chat", handleAsync(handleChat));
  router.post("/voice", handleAsync(handleVoice));

  return router;
}

async function handleProtocolMetadata(req, res) {
  res.status(200).json(buildProtocolMetadata(req));
}

async function handleChat(req, res) {
  const result = await createChatCompletion(req.body);

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json(result.data);
}

async function handleVoice(req, res) {
  await streamVoice(req, res);
}

module.exports = { createApiRouter, handleProtocolMetadata };
