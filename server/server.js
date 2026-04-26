const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
require("dotenv").config({ path: path.resolve(__dirname, ".env"), quiet: true });
const express = require("express");
const cors = require("cors");

// Runtime configuration is read from server/.env, with conservative defaults for
// local development and API provider fallbacks where the older XAI names exist.
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
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful AI assistant for this website. Answer clearly, be practical, and ask a short follow-up question only when needed.";
const PERSONA_FILE = process.env.PERSONA_FILE || "persona.type.yaml";

const clientDist = path.resolve(__dirname, "..", "client", "vite_project", "dist");
const app = express();

// Shared middleware accepts browser requests and larger JSON bodies for chat
// payloads that may include multimodal message content.
app.use(cors());
app.use(express.json({ limit: MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_UPLOAD_SIZE }));

// API endpoints are wrapped so async exceptions flow into the Express error
// handler instead of leaving requests hanging.
app.post("/api/chat", handleAsync(handleChat));
app.post("/api/voice", handleAsync(handleVoice));

// Serve the compiled React app after API routes. HTML is not cached so users get
// the latest build, while static assets can be cached briefly.
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

app.listen(PORT, () => {
  console.log(`API server running at https://aichatbotsite.onrender.com`);
});

async function handleChat(req, res) {
  if (!OPENROUTER_API_KEY) {
    res.status(500).json({
      error:
        "Missing OPENROUTER_API_KEY. Add it to server/.env, then restart the server.",
    });
    return;
  }

  // Keep only recent user/assistant turns with valid content before forwarding
  // the conversation to the model provider.
  const incomingMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = incomingMessages
    .filter((message) => {
      return (
        message &&
        ["user", "assistant"].includes(message.role) &&
        hasMessageContent(message.content)
      );
    })
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: normalizeMessageContent(message.content),
    }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    res.status(400).json({ error: "Send at least one user message." });
    return;
  }

  let response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-OpenRouter-Title": OPENROUTER_APP_NAME,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
        stream: false,
      }),
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: "Could not connect to OpenRouter. Check network access and server logs.",
    });
    return;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage =
      data.error?.message ||
      data.message ||
      `OpenRouter request failed with ${response.status}`;
    res.status(response.status).json({ error: apiMessage });
    return;
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    res.status(502).json({ error: "OpenRouter returned an empty response." });
    return;
  }

  res.status(200).json({
    reply,
    model: data.model || OPENROUTER_MODEL,
    usage: data.usage || null,
  });
}

async function handleVoice(req, res) {
  if (!ELEVENLABS_API_KEY) {
    res.status(500).json({
      error:
        "Missing ELEVENLABS_API_KEY. Add it to server/.env, then restart the server.",
    });
    return;
  }

  // ElevenLabs receives bounded text so very large client input cannot create an
  // oversized text-to-speech request.
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Text is required." });
    return;
  }

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(
      ELEVENLABS_VOICE_ID
    )}/stream?output_format=${encodeURIComponent(ELEVENLABS_OUTPUT_FORMAT)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text.slice(0, 3000),
        model_id: ELEVENLABS_MODEL_ID,
      }),
    }
  ).catch((error) => {
    console.error(error);
    return null;
  });

  if (!response) {
    res.status(502).json({
      error: "Could not connect to ElevenLabs. Check network access and server logs.",
    });
    return;
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    res.status(response.status).json({
      error: details || `ElevenLabs request failed with ${response.status}`,
    });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  Readable.fromWeb(response.body).pipe(res);
}

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

function handleAsync(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

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

function buildSystemPrompt() {
  const personaPath = path.resolve(__dirname, PERSONA_FILE);
  const persona = readPersonaFile(personaPath);

  if (!persona) return SYSTEM_PROMPT;

  // Persona fields are appended to the base system prompt when the optional
  // persona.type.yaml file is present.
  return [
    SYSTEM_PROMPT,
    "Persona configuration:",
    persona.name ? `Name: ${persona.name}` : "",
    persona.role ? `Role: ${persona.role}` : "",
    persona.tone ? `Tone: ${persona.tone}` : "",
    persona.style ? `Style: ${persona.style}` : "",
    persona.instructions ? `Instructions: ${persona.instructions}` : "",
    persona.boundaries ? `Boundaries: ${persona.boundaries}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function readPersonaFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  // This intentionally supports the small YAML subset used by persona.type.yaml:
  // simple key/value pairs plus literal blocks written with "key: |".
  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};
  let currentKey = "";

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const blockMatch = line.match(/^([A-Za-z0-9_-]+):\s*\|\s*$/);
    if (blockMatch) {
      currentKey = blockMatch[1];
      result[currentKey] = "";
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValueMatch) {
      currentKey = "";
      result[keyValueMatch[1]] = keyValueMatch[2].replace(/^["']|["']$/g, "");
      continue;
    }

    if (currentKey && /^\s+/.test(line)) {
      result[currentKey] = `${result[currentKey]}${line.trim()}\n`;
    }
  }

  for (const key of Object.keys(result)) {
    result[key] = String(result[key]).trim();
  }

  return result;
}

function hasMessageContent(content) {
  if (typeof content === "string") return Boolean(content.trim());
  if (!Array.isArray(content)) return false;

  return content.some((part) => {
    if (!part || typeof part !== "object") return false;
    if (part.type === "text") return Boolean(String(part.text || "").trim());
    if (part.type === "image_url") return Boolean(part.image_url?.url);
    return false;
  });
}

function normalizeMessageContent(content) {
  if (typeof content === "string") return content.trim();

  return content
    .filter((part) => part && typeof part === "object")
    .map((part) => {
      if (part.type === "image_url" && part.image_url?.url) {
        return {
          type: "image_url",
          image_url: { url: part.image_url.url },
        };
      }

      return {
        type: "text",
        text: String(part.text || "").trim(),
      };
    })
    .filter((part) => {
      if (part.type === "image_url") return true;
      return Boolean(part.text);
    });
}
