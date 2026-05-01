const path = require("path");

// Runtime configuration module.
// Loads server/.env once, builds shared filesystem paths, and exposes provider
// settings used by routes, services, and middleware across the server.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });
const serverRoot = path.resolve(__dirname, "..");
const clientDist = path.resolve(serverRoot, "..", "client", "vite_project", "dist");

const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_SIZE = process.env.MAX_UPLOAD_SIZE || "50mb";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.XAI_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || process.env.XAI_MODEL || "x-ai/grok-4.20";
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_SITE_URL =
  process.env.OPENROUTER_SITE_URL ||
  process.env.CLIENT_ORIGIN ||
  "https://aichatbotsite.onrender.com";
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "My AI Website";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const ELEVENLABS_OUTPUT_FORMAT =
  process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

const NOVELAI_API_KEY = process.env.NOVELAI_API_KEY;
const NOVELAI_BASE_URL = process.env.NOVELAI_BASE_URL || "https://image.novelai.net";
const NOVELAI_IMAGE_MODEL =
  process.env.NOVELAI_IMAGE_MODEL || "nai-diffusion-4-5-curated";
const NOVELAI_IMAGE_ENDPOINT =
  process.env.NOVELAI_IMAGE_ENDPOINT || "/ai/generate-image";

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful AI assistant for this website. Answer clearly, be practical, and ask a short follow-up question only when needed.";
const PERSONA_FILE = process.env.PERSONA_FILE || "persona.type.yaml";

module.exports = {
  serverRoot,
  clientDist,
  PORT,
  MAX_UPLOAD_SIZE,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_SITE_URL,
  OPENROUTER_APP_NAME,
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE_URL,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_OUTPUT_FORMAT,
  NOVELAI_API_KEY,
  NOVELAI_BASE_URL,
  NOVELAI_IMAGE_MODEL,
  NOVELAI_IMAGE_ENDPOINT,
  SYSTEM_PROMPT,
  PERSONA_FILE,
};
