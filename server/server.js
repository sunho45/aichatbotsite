const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
require("dotenv").config({ quiet: true });

const PORT = Number(process.env.PORT || 3000);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.XAI_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || process.env.XAI_MODEL || "x-ai/grok-4.20";
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_SITE_URL =
  process.env.OPENROUTER_SITE_URL || process.env.CLIENT_ORIGIN || "http://192.168.219.120:5173";
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
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice") {
      await handleVoice(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    serveReactApp(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`API server running at http://192.168.219.120:${PORT}`);
});

async function handleChat(req, res) {
  if (!OPENROUTER_API_KEY) {
    sendJson(res, 500, {
      error:
        "Missing OPENROUTER_API_KEY. Add it to server/.env, then restart the server.",
    });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
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
    sendJson(res, 400, { error: "Send at least one user message." });
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
    sendJson(res, 502, {
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
    sendJson(res, response.status, { error: apiMessage });
    return;
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    sendJson(res, 502, { error: "OpenRouter returned an empty response." });
    return;
  }

  sendJson(res, 200, {
    reply,
    model: data.model || OPENROUTER_MODEL,
    usage: data.usage || null,
  });
}

async function handleVoice(req, res) {
  if (!ELEVENLABS_API_KEY) {
    sendJson(res, 500, {
      error:
        "Missing ELEVENLABS_API_KEY. Add it to server/.env, then restart the server.",
    });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    sendJson(res, 400, { error: "Text is required." });
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
    sendJson(res, 502, {
      error: "Could not connect to ElevenLabs. Check network access and server logs.",
    });
    return;
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    sendJson(res, response.status, {
      error: details || `ElevenLabs request failed with ${response.status}`,
    });
    return;
  }

  setCorsHeaders(res);
  res.writeHead(200, {
    "Content-Type": response.headers.get("content-type") || "audio/mpeg",
    "Cache-Control": "no-store",
  });
  Readable.fromWeb(response.body).pipe(res);
}

function serveReactApp(requestPath, res, headOnly) {
  const safePath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const requestedFile = path.normalize(path.join(clientDist, safePath));

  if (!requestedFile.startsWith(clientDist)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(requestedFile, (error, content) => {
    if (error) {
      fs.readFile(path.join(clientDist, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          sendJson(res, 404, {
            error: "React build not found. Run npm run build in client/vite_project.",
          });
          return;
        }
        res.writeHead(200, { "Content-Type": contentTypes[".html"] });
        if (!headOnly) res.end(fallback);
        else res.end();
      });
      return;
    }

    const ext = path.extname(requestedFile).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    if (!headOnly) res.end(content);
    else res.end();
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CLIENT_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function buildSystemPrompt() {
  const personaPath = path.resolve(__dirname, PERSONA_FILE);
  const persona = readPersonaFile(personaPath);

  if (!persona) return SYSTEM_PROMPT;

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
