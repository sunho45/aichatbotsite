const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
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
const SERVER_NAME = "my-ai-website";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_REVISION = "2025-06-18";
const TRANSPORT_HEADERS = [
  "X-Protocol-Name",
  "X-Protocol-Revision",
  "X-Transport-Type",
];

const API_TOOLS = [
  {
    name: "chat",
    title: "AI Chat",
    description: "Send recent chat messages to the configured OpenRouter model.",
    transport: {
      method: "WEBSOCKET",
      path: "/api/chat",
      contentType: "application/json",
      responseType: "application/json",
    },
    inputSchema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          description: "Recent user and assistant messages.",
        },
      },
      required: ["messages"],
    },
    outputSchema: {
      type: "object",
      properties: {
        reply: { type: "string" },
        model: { type: "string" },
        usage: { type: ["object", "null"] },
      },
      required: ["reply", "model", "usage"],
    },
    annotations: {
      title: "AI Chat",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "voice",
    title: "Text To Speech",
    description: "Convert text into streamed speech audio with ElevenLabs.",
    transport: {
      method: "POST",
      path: "/api/voice",
      contentType: "application/json",
      responseType: "audio/mpeg",
    },
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          maxLength: 3000,
          description: "Text to synthesize into speech.",
        },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        audio: { type: "string", description: "Streamed audio response body." },
      },
    },
    annotations: {
      title: "Text To Speech",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

const clientDist = path.resolve(__dirname, "..", "client", "vite_project", "dist");
const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

// Shared middleware accepts browser requests and larger JSON bodies for chat
// payloads that may include multimodal message content.
app.use(cors({ exposedHeaders: TRANSPORT_HEADERS }));
app.use(express.json({ limit: MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_UPLOAD_SIZE }));
app.use(attachTransportHeaders);

// API endpoints are wrapped so async exceptions flow into the Express error
// handler instead of leaving requests hanging.
app.get(
  ["/api/protocol", "/api/metadata", "/.well-known/ai-server.json"],
  handleAsync(handleProtocolMetadata)
);
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

server.on("upgrade", handleWebSocketUpgrade);

server.listen(PORT, () => {
  console.log(`API server running at https://aichatbotsite.onrender.com`);
});

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

function handleWebSocketUpgrade(req, socket, head) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/api/chat") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n")
  );

  const connection = {
    socket,
    buffer: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
    fragments: [],
  };

  socket.on("data", (chunk) => handleWebSocketData(connection, chunk));
  socket.on("error", (error) => console.error(error));
}

function handleWebSocketData(connection, chunk) {
  connection.buffer = Buffer.concat([connection.buffer, chunk]);

  while (connection.buffer.length) {
    let parsed;
    try {
      parsed = readWebSocketFrame(connection.buffer);
    } catch (error) {
      console.error(error);
      sendWebSocketJson(connection.socket, {
        type: "error",
        error: "WebSocket payload is too large.",
        status: 413,
      });
      closeWebSocket(connection.socket);
      return;
    }

    if (!parsed) return;

    connection.buffer = connection.buffer.slice(parsed.frameLength);
    handleWebSocketFrame(connection, parsed);
  }
}

function handleWebSocketFrame(connection, frame) {
  if (frame.opcode === 0x8) {
    closeWebSocket(connection.socket);
    return;
  }

  if (frame.opcode === 0x9) {
    writeWebSocketFrame(connection.socket, 0xA, frame.payload);
    return;
  }

  if (frame.opcode === 0x1 && !frame.fin) {
    connection.fragments = [frame.payload];
    return;
  }

  if (frame.opcode === 0x0 && connection.fragments.length) {
    connection.fragments.push(frame.payload);
    if (!frame.fin) return;

    processWebSocketMessage(connection, Buffer.concat(connection.fragments).toString("utf8"));
    connection.fragments = [];
    return;
  }

  if (frame.opcode === 0x1) {
    processWebSocketMessage(connection, frame.payload.toString("utf8"));
  }
}

async function processWebSocketMessage(connection, rawMessage) {
  let payload;
  try {
    payload = JSON.parse(rawMessage);
  } catch {
    sendWebSocketJson(connection.socket, {
      type: "error",
      error: "Invalid JSON message.",
      status: 400,
    });
    return;
  }

  sendWebSocketJson(connection.socket, { type: "status", status: "thinking" });

  const result = await createChatCompletion(payload);
  if (!result.ok) {
    sendWebSocketJson(connection.socket, {
      type: "error",
      error: result.error,
      status: result.status,
    });
    return;
  }

  sendWebSocketJson(connection.socket, {
    type: "reply",
    ...result.data,
  });
}

function readWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const fin = Boolean(firstByte & 0x80);
  const opcode = firstByte & 0x0f;
  const masked = Boolean(secondByte & 0x80);
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WebSocket payload is too large.");
    }
    payloadLength = Number(length);
    offset += 8;
  }

  const maskLength = masked ? 4 : 0;
  const frameLength = offset + maskLength + payloadLength;
  if (buffer.length < frameLength) return null;

  let payload = buffer.slice(offset + maskLength, frameLength);
  if (masked) {
    const mask = buffer.slice(offset, offset + maskLength);
    payload = Buffer.from(payload);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return { fin, opcode, payload, frameLength };
}

function sendWebSocketJson(socket, payload) {
  if (socket.destroyed) return;
  writeWebSocketFrame(socket, 0x1, Buffer.from(JSON.stringify(payload), "utf8"));
}

function closeWebSocket(socket) {
  if (socket.destroyed) return;
  writeWebSocketFrame(socket, 0x8, Buffer.alloc(0));
  socket.end();
}

function writeWebSocketFrame(socket, opcode, payload) {
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

async function createChatCompletion(payload) {
  if (!OPENROUTER_API_KEY) {
    return {
      ok: false,
      status: 500,
      error:
        "Missing OPENROUTER_API_KEY. Add it to server/.env, then restart the server.",
    };
  }

  // Keep only recent user/assistant turns with valid content before forwarding
  // the conversation to the model provider.
  const incomingMessages = Array.isArray(payload?.messages) ? payload.messages : [];
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
    return { ok: false, status: 400, error: "Send at least one user message." };
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
    return {
      ok: false,
      status: 502,
      error: "Could not connect to OpenRouter. Check network access and server logs.",
    };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage =
      data.error?.message ||
      data.message ||
      `OpenRouter request failed with ${response.status}`;
    return { ok: false, status: response.status, error: apiMessage };
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    return { ok: false, status: 502, error: "OpenRouter returned an empty response." };
  }

  return {
    ok: true,
    data: {
      reply,
      model: data.model || OPENROUTER_MODEL,
      usage: data.usage || null,
    },
  };
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

function attachTransportHeaders(req, res, next) {
  if (req.path.startsWith("/api/")) {
    res.setHeader(TRANSPORT_HEADERS[0], SERVER_NAME);
    res.setHeader(TRANSPORT_HEADERS[1], PROTOCOL_REVISION);
    res.setHeader(TRANSPORT_HEADERS[2], "http-json");
  }

  next();
}

function buildProtocolMetadata(req) {
  const baseUrl = getBaseUrl(req);
  const serverPath = path.resolve(__dirname, "server.js");

  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocol: {
      name: "custom-ai-chat-api",
      revision: PROTOCOL_REVISION,
      wireFormat: "WebSocket JSON plus HTTP JSON",
    },
    transport: {
      type: "mixed",
      baseUrl,
      encoding: "utf-8",
      endpoints: API_TOOLS.map((tool) => ({
        name: tool.name,
        url:
          tool.name === "chat"
            ? `${getWebSocketBaseUrl(req)}${tool.transport.path}`
            : `${baseUrl}${tool.transport.path}`,
        ...tool.transport,
      })),
    },
    annotations: {
      audience: ["user", "assistant"],
      priority: 0.8,
      lastModified: getIsoModifiedTime(serverPath),
    },
    tools: API_TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
    })),
  };
}

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

function getIsoModifiedTime(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
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
